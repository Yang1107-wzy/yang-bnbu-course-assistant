# Security Policy

## Supported version

Only the latest GitHub Release is supported.

## Reporting a vulnerability

Please use the repository's private **Security Advisories** feature instead of opening a public Issue. Do not include MIS credentials, cookies, tokens, request headers, student names, student IDs, or full authenticated HTML.

Include only:

- the released version;
- browser and Tampermonkey versions;
- the affected MIS path without URL query parameters;
- a minimal redacted reproduction;
- the expected and observed safety behavior.

## Safety boundary

The project reads visible DOM from an already authenticated BNBU MIS page. It must not handle credentials or CAPTCHA, call hidden course-selection APIs, bypass access controls, or execute Replace, Drop, Exit Waiting, or unknown page functions.
