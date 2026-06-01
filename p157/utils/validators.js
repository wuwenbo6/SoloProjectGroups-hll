function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: '密码不能为空' };
  }

  if (password.length < 8) {
    return { valid: false, message: '密码长度至少为8位' };
  }

  const hasLetter = /[a-zA-Z]/.test(password);
  if (!hasLetter) {
    return { valid: false, message: '密码必须包含字母' };
  }

  const hasDigit = /\d/.test(password);
  if (!hasDigit) {
    return { valid: false, message: '密码必须包含数字' };
  }

  return { valid: true, message: '密码强度符合要求' };
}

module.exports = {
  validatePassword
};
