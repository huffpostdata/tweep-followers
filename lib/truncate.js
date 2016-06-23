module.exports = function truncate(s) {
  if (s.length > 80) {
    return s.substring(0, 79) + '…'
  } else {
    return s
  }
}
