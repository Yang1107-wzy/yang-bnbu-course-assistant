export const COMPLIANCE_ACK_KEY = "bnbu.courseAssistant.complianceAck.v1";
export const COMPLIANCE_LICENSE_ID = "Yang-NCEL-1.0";
export const COMPLIANCE_NOTICE_VERSION = 1;

export const COMPLIANCE_SHORT_NOTICE = "仅供学习交流｜禁止商业使用｜不得用于学校正式选课｜请遵守中国法律法规及学校规定";

export const COMPLIANCE_NOTICE_ITEMS = Object.freeze([
  "本项目仅供个人学习、技术交流、教学演示和受控环境研究。",
  "禁止任何商业用途，包括销售、收费服务、代操作、广告获利、商业部署和商业产品集成。",
  "不得用于学校正式选课、正式抢课、轮候或其他真实教务提交。",
  "使用者必须遵守中华人民共和国法律法规、网络安全与数据保护要求，以及学校规章和信息系统使用规定。",
  "不得绕过验证码、访问控制、限流、反自动化机制或学校安全措施。",
  "本项目不是 BNBU 官方产品，不代表学校，不保证课程名额、操作成功或页面持续兼容。",
  "使用者应对自己的安装、修改、运行和传播行为承担责任；本声明不构成法律意见。"
]);

export const isComplianceAcknowledged = (value) => Boolean(
  value
  && value.licenseId === COMPLIANCE_LICENSE_ID
  && value.noticeVersion === COMPLIANCE_NOTICE_VERSION
  && value.accepted === true
  && Number.isFinite(value.acceptedAt)
  && value.acceptedAt > 0
);

export const createComplianceAcknowledgement = (acceptedAt) => ({
  licenseId: COMPLIANCE_LICENSE_ID,
  noticeVersion: COMPLIANCE_NOTICE_VERSION,
  accepted: true,
  acceptedAt
});
