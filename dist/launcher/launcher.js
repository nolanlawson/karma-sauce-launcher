"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SaucelabsLauncher = void 0;
const webdriverio_1 = require("webdriverio");
const saucelabs_1 = require("saucelabs");
const process_config_1 = require("../process-config");
const utils_1 = require("../utils");
// Array of connected drivers. This is useful for quitting all connected drivers on kill.
let connectedDrivers = new Map();
function SaucelabsLauncher(args, 
/* config.sauceLabs */ config, 
/* SauceConnect */ sauceConnect, browserMap, logger, baseLauncherDecorator, captureTimeoutLauncherDecorator, retryLauncherDecorator) {
    // Apply base class mixins. This would be nice to have typed, but this is a low-priority now.
    baseLauncherDecorator(this);
    captureTimeoutLauncherDecorator(this);
    retryLauncherDecorator(this);
    // initiate driver with null to not close the tunnel too early
    connectedDrivers.set(this.id, null);
    const log = logger.create("SaucelabsLauncher");
    const { startConnect, sauceConnectOptions, seleniumCapabilities, browserName, } = process_config_1.processConfig(config, args);
    // Setup Browser name that will be printed out by Karma.
    this.name = browserName + " on SauceLabs";
    let pendingHeartBeat;
    // Heartbeat function to keep alive sessions on Sauce Labs via WebDriver calls
    const heartbeat = () => {
        const driver = connectedDrivers.get(this.id);
        pendingHeartBeat = setTimeout(() => __awaiter(this, void 0, void 0, function* () {
            if (!driver) {
                return;
            }
            try {
                yield driver.getTitle();
                log.debug("Heartbeat to Sauce Labs (%s) - fetching title", browserName);
                heartbeat();
            }
            catch (ign) {
                // Do nothing, just clear the timeout
                clearTimeout(pendingHeartBeat);
            }
            return;
        }), 60000);
    };
    // Upload the new job results to Sauce Labs
    // @TODO: this is not working now, files first need to be created locally, then uploaded
    // and then deleted to make this work.
    const uploadJobResult = (browserData, browserName) => __awaiter(this, void 0, void 0, function* () {
        const { sessionId, username, accessKey, region, results } = browserData;
        const api = new saucelabs_1.default({
            user: username,
            key: accessKey,
            region: region,
        });
        try {
            let oldLogs;
            // Wait until the vm is destroyed and the assets are stored
            yield utils_1.waitUntil({
                condition: () => __awaiter(this, void 0, void 0, function* () {
                    log.info(`Check if 'log.json' for browser '${browserName}' has already been stored.`);
                    oldLogs = yield api.downloadJobAsset(sessionId, "log.json");
                    return oldLogs;
                }),
                maxRetries: 25,
            });
            // Only update the new logs if we received the old logs, else do nothing and keep the old logs
            if (oldLogs) {
                // Now push the new and old job assets to Sauce Labs
                yield api.uploadJobAssets(sessionId, {
                    files: ["log.json", "old-log.json"],
                });
            }
        }
        catch (e) {
            log.error(`There was an error uploading the data to SauceLabs: ${e.message}`);
        }
    });
    // Listen for the start event from Karma. I know, the API is a bit different to how you
    // would expect, but we need to follow this approach unless we want to spend more work
    // improving type safety.
    this.on("start", (pageUrl) => __awaiter(this, void 0, void 0, function* () {
        if (startConnect) {
            try {
                // In case the "startConnect" option has been enabled, establish a tunnel and wait
                // for it being ready. In case a tunnel is already active, this will just continue
                // without establishing a new one.
                yield sauceConnect.establishTunnel(seleniumCapabilities, sauceConnectOptions);
            }
            catch (error) {
                log.error(error);
                this._done("failure");
                return;
            }
        }
        try {
            // See the following link for public API of the selenium server.
            // https://wiki.saucelabs.com/display/DOCS/Instant+Selenium+Node.js+Tests
            const driver = yield webdriverio_1.remote(seleniumCapabilities);
            // Keep track of all connected drivers because it's possible that there are multiple
            // driver instances (e.g. when running with concurrency)
            connectedDrivers.set(this.id, driver);
            const sessionId = driver.sessionId;
            log.info("%s session at https://saucelabs.com/tests/%s", browserName, sessionId);
            log.debug('Opening "%s" on the selenium client', pageUrl);
            // Store the information about the current session in the browserMap. This is necessary
            // because otherwise the Saucelabs reporter is not able to report results.
            browserMap.set(this.id, {
                sessionId,
                username: seleniumCapabilities.user,
                accessKey: seleniumCapabilities.key,
                region: seleniumCapabilities.region,
                headless: seleniumCapabilities.headless,
                results: [],
            });
            yield driver.url(pageUrl);
            heartbeat();
        }
        catch (e) {
            log.error(e);
            // Notify karma about the failure.
            this._done("failure");
        }
    }));
    this.on("kill", (done) => __awaiter(this, void 0, void 0, function* () {
        // If there is still pending heartbeats, clear the timeout
        if (pendingHeartBeat) {
            clearTimeout(pendingHeartBeat);
        }
        try {
            const browserData = browserMap.get(this.id);
            const driver = connectedDrivers.get(this.id);
            yield driver.deleteSession();
            // @TODO: temp disabled uploadJobResult because it's failing now
            // await uploadJobResult(browserData, browserName);
        }
        catch (e) {
            // We need to ignore the exception here because we want to make sure that Karma is still
            // able to retry connecting if Saucelabs itself terminated the session (and not Karma)
            // For example if the "idleTimeout" is exceeded and Saucelabs errored the session. See:
            // https://wiki.saucelabs.com/display/DOCS/Test+Didn%27t+See+a+New+Command+for+90+Seconds
            log.error("Could not quit the Saucelabs selenium connection. Failure message:");
            log.error(e);
        }
        connectedDrivers.delete(this.id);
        this._done();
        return process.nextTick(done);
    }));
}
exports.SaucelabsLauncher = SaucelabsLauncher;
//# sourceMappingURL=launcher.js.map