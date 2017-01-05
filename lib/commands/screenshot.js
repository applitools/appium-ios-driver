import uuid from 'uuid-js';
import B from 'bluebird';
import path from 'path';
import { retry } from 'asyncbox';
import { fs, mkdirp } from 'appium-support';
import { utils } from 'appium-uiauto';
import logger from '../logger';
import { errors, ImageHelpers } from 'appium-base-driver';


let commands = {}, helpers = {}, extensions = {};

commands.getScreenshot = async function () {
  let guid = uuid.create();
  let shotFile = `screenshot${guid}`;

  let shotFolder = path.resolve(this.opts.tmpDir, 'appium-instruments/Run 1/');
  if (!(await fs.exists(shotFolder))) {
    logger.debug(`Creating folder '${shotFolder}'`);
    await mkdirp(shotFolder);
  }

  let shotPath = path.resolve(shotFolder, `${shotFile}.png`);
  logger.debug(`Taking screenshot: '${shotPath}'`);

  let takeScreenShot = async () => {
    await this.uiAutoClient.sendCommand(`au.capture('${shotFile}')`);

    let screenshotWaitTimeout = (this.opts.screenshotWaitTimeout || 10) * 1000;
    logger.debug(`Waiting ${screenshotWaitTimeout} ms for screenshot to be generated.`);
    let startMs = Date.now();

    let success = false;
    while ((Date.now() - startMs) < screenshotWaitTimeout) {
      if (await fs.hasAccess(shotPath)) {
        success = true;
        break;
      }
      await B.delay(300);
    }
    if (!success) {
      throw new errors.UnknownError('Timed out waiting for screenshot file');
    }

    // check the rotation, and rotate if necessary
    if (await this.getOrientation() === 'LANDSCAPE') {
      logger.debug('Rotating landscape screenshot');
      await utils.rotateImage(shotPath, -90);
    }
    return await fs.readFile(shotPath);
  };

  // Retrying the whole screenshot process for three times.
  let data = await retry(3, takeScreenShot);
  return new Buffer(data).toString('base64');
};

commands.getViewportScreenshot = async function() {
  const windowSize = await this.getWindowSize();
  const screenHeight = await this.getScreenHeight(); 
  // There is no way to grab scale from UIAutomation. All devices has scale 2.0 except iPhone 6+, iPhone 6s+, iPhone7+ - 3.0. 
  const scale = screenHeight == 736 ? 3 : 2;

  const statusBarHeight = await this.getStatusBarHeight() * scale; 
  const screenshot = await this.getScreenshot();  
  let rect = {left: 0, top: statusBarHeight, width: windowSize.width * scale, height: windowSize.height * scale - statusBarHeight}; 
  let newScreenshot = await ImageHelpers.cropBase64Image(screenshot, rect); 
  return newScreenshot;
}

commands.getStatusBarHeight = async function() { 
  const command = 'UIATarget.localTarget().frontMostApp().statusBar().rect().size.height;'; 
  const statusBarHeight = await this.uiAutoClient.sendCommand(command); 
  return statusBarHeight; 
}

commands.getScreenHeight = async function() { 
  const command = 'UIATarget.localTarget().rect().size.height;'; 
  const screenHeight = await this.uiAutoClient.sendCommand(command); 
  return screenHeight;
 }

Object.assign(extensions, commands, helpers);
export { commands, helpers };
export default extensions;
