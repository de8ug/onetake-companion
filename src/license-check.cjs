// Only return coarse diagnostics. Never return/log the session token or provider response.
async function checkProLicense(fetcher, url, license) {
  let response;
  try {
    response = await fetcher(url, { method: "POST", redirect: "error", headers: { Authorization: `Bearer ${license}` }, signal: AbortSignal.timeout(8000) });
  } catch {
    return { status: 503, code: "PRO_VALIDATION_UNAVAILABLE", message: "暂时连接不上会员验证服务，请稍后重试；无需重新购买或激活，原片已保留" };
  }
  if (response.status === 429) return { status: 429, code: "PRO_VALIDATION_BUSY", message: "会员验证请求较多，请稍后重试；原片已保留" };
  if (response.status >= 500) return { status: 503, code: "PRO_VALIDATION_UNAVAILABLE", message: "会员验证服务暂时不可用，请稍后重试；无需重新激活" };
  let data;
  try { data = await response.json(); } catch {
    return { status: 503, code: "PRO_VALIDATION_UNAVAILABLE", message: "会员验证服务返回异常，请稍后重试；无需重新激活" };
  }
  if (response.ok && data?.valid === true) {
    return data.tier === "PRO" ? null : { status: 403, code: "PRO_REQUIRED", message: "当前账户尚未开通 PRO，请在 OneTake 登录邮箱账户并兑换激活码" };
  }
  if (data?.valid === false && [401,403,200].includes(response.status)) {
    return { status: 403, code: "PRO_SESSION_INVALID", message: "账户登录已失效，请回到 OneTake 用原邮箱重新登录；无需再次购买或兑换激活码，原片已保留" };
  }
  return { status: 503, code: "PRO_VALIDATION_UNAVAILABLE", message: "会员验证接口返回异常，请检查工作台授权地址后重试；无需重新激活" };
}
module.exports = { checkProLicense };
