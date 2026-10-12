import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeResumeLanguage, resumeLanguages } from '../lib/resume-languages';
test('the bot reads old labels and structured text[] language entries', () => {
  assert.equal(decodeResumeLanguage('uzbek'), 'uzbek');
  assert.deepEqual(decodeResumeLanguage('{"name":"english","level":"advanced"}'), { name: 'english', level: 'advanced' });
  assert.deepEqual(resumeLanguages(['russian', '{"name":"english","level":"advanced"}']), [{ name: 'russian' }, { name: 'english', level: 'advanced' }]);
});
