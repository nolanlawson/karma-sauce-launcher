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
exports.isW3C = exports.waitUntil = void 0;
function waitUntil({ condition, retries = 0, maxRetries = 50, interval = 200 }) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return yield condition();
        }
        catch (error) {
            if (retries >= maxRetries) {
                throw error;
            }
        }
        yield new Promise((resolve) => setTimeout(resolve, interval));
        return waitUntil({ condition, retries: retries + 1, maxRetries, interval });
    });
}
exports.waitUntil = waitUntil;
function isW3C(capabilities) {
    // Only browserVersion is mandatory, platformName is optional
    return Boolean(capabilities.browserVersion);
}
exports.isW3C = isW3C;
//# sourceMappingURL=utils.js.map