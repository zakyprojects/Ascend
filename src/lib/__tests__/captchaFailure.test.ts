// Fixtures for the bot-check failure messages: each Turnstile error code maps to the reason people
// are shown (slow internet, a blocked browser, or our setup), and the text reaches the form as is.
import {
  CAPTCHA_BLOCKED_MESSAGE,
  CAPTCHA_CONFIG_MESSAGE,
  CAPTCHA_FAILED_MESSAGE,
  CAPTCHA_SLOW_MESSAGE,
  captchaFailureMessage,
  classifyTurnstileCode,
} from '../captcha';
import { toUserMessage } from '../userMessage';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

assert(classifyTurnstileCode('200500') === 'network', '200500 iframe load = network');
assert(classifyTurnstileCode('110600') === 'network', '110600 challenge timed out = network');
assert(classifyTurnstileCode('300010') === 'blocked', '300* = blocked');
assert(classifyTurnstileCode('600010') === 'blocked', '600* = blocked');
assert(classifyTurnstileCode('200100') === 'blocked', '200100 clock = blocked');
for (const code of ['110100', '110110', '110200', '400020', '400021', '400070']) {
  assert(classifyTurnstileCode(code) === 'config', `${code} = config`);
}
assert(classifyTurnstileCode('') === 'other', 'missing code = other');
assert(classifyTurnstileCode('110620') === 'other', '110620 unanswered click = other');
assert(classifyTurnstileCode('999999') === 'other', 'unknown code = other');

assert(captchaFailureMessage('network') === CAPTCHA_SLOW_MESSAGE, 'network message');
assert(captchaFailureMessage('blocked') === CAPTCHA_BLOCKED_MESSAGE, 'blocked message');
assert(captchaFailureMessage('config') === CAPTCHA_CONFIG_MESSAGE, 'config message');
assert(captchaFailureMessage('other') === CAPTCHA_FAILED_MESSAGE, 'other message');

for (const message of [CAPTCHA_SLOW_MESSAGE, CAPTCHA_BLOCKED_MESSAGE, CAPTCHA_CONFIG_MESSAGE, CAPTCHA_FAILED_MESSAGE]) {
  assert(toUserMessage(new Error(message), 'fallback') === message, `shown as written: ${message}`);
}

console.log('captchaFailure fixtures: all passed');
