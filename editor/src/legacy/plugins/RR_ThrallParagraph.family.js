'use strict';
// modern algebra's Paragraph Formatter (VX): a library; nothing in the events calls it.
module.exports = () => ({ key: 'thrallParagraph', detect: /module Paragrapher\b[\s\S]*class Formatter\b[\s\S]*def draw_paragraph|def draw_paragraph[\s\S]*module Paragrapher\b/, plugin: 'RR_ThrallParagraph' });
