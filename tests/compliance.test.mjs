import test from "node:test";
import assert from "node:assert/strict";

import {
  COMPLIANCE_LICENSE_ID,
  COMPLIANCE_NOTICE_VERSION,
  createComplianceAcknowledgement,
  isComplianceAcknowledged
} from "../src/compliance.js";

test("合规确认只接受当前许可证和声明版本", () => {
  const acknowledgement = createComplianceAcknowledgement(123456789);

  assert.deepEqual(acknowledgement, {
    licenseId: COMPLIANCE_LICENSE_ID,
    noticeVersion: COMPLIANCE_NOTICE_VERSION,
    accepted: true,
    acceptedAt: 123456789
  });
  assert.equal(isComplianceAcknowledged(acknowledgement), true);

  assert.equal(isComplianceAcknowledged({ ...acknowledgement, licenseId: "old-license" }), false);
  assert.equal(isComplianceAcknowledged({ ...acknowledgement, noticeVersion: 0 }), false);
  assert.equal(isComplianceAcknowledged({ ...acknowledgement, accepted: false }), false);
  assert.equal(isComplianceAcknowledged({ ...acknowledgement, acceptedAt: 0 }), false);
  assert.equal(isComplianceAcknowledged(null), false);
});
