const EOL = '\n'

/**
 * 
 * @param {string} data 
 * @example [length: 03:36]
 * @return {<Array>{string}} ['length', '03:06']
 */

function extractInfo(data) {
  const info = data.trim().slice(1, -1) // remove brackets: length: 03:06
  return info.split(': ')
}

function lrcParser(data) {
  if (typeof data !== 'string') {
    throw new TypeError('expect first argument to be a string')
  }
  // split a long stirng into lines by system's end-of-line marker line \r\n on Windows
  // or \n on POSIX
  let lines = data.split(EOL)
  const timeStart = /\[(\d*\:\d*\.?\d*)\]/ // i.g [00:10.55]
  const scriptText = /(.+)/ // Havana ooh na-na (ayy) 
  const timeEnd = timeStart
  const startAndText = new RegExp(timeStart.source + scriptText.source)


  const infos = []
  const scripts = []
  const result = {}

  for(let i = 0; startAndText.test(lines[i]) === false; i++) {
    infos.push(lines[i])
  }

  infos.reduce((result, info) => {
    const [key, value] = extractInfo(info)
    result[key] = value
    return result
  }, result)

  lines.splice(0, infos.length) // remove all info lines
  const qualified = new RegExp(startAndText.source + '|' + timeEnd.source)
  lines = lines.filter(line => qualified.test(line))
  
  for (let i = 0, l = lines.length; i < l; i++) {
    const matches = startAndText.exec(lines[i])
    const timeEndMatches = timeEnd.exec(lines[i + 1])  
    if (matches && timeEndMatches) {
      const [, start, text] = matches
      const [, end] = timeEndMatches
      scripts.push({
        start: convertTime(start),
        text,
        end: convertTime(end),
      })
    }
  }

  result.scripts = scripts
  return result
}

// convert time string to seconds
// i.g: [01:09.10] -> 69.10
function convertTime(string) {
  string = string.split(':');
  const minutes = parseInt(string[0], 10)
  const seconds = parseFloat(string[1])
  if (minutes > 0) {
    const sc = minutes * 60 + seconds
    return parseFloat(sc.toFixed(2))
  }
  return seconds
}

const data = lrcParser(`
[00:00.000] 作曲 : 陈小霞
[00:02.96]编曲 : 陈辉阳
[00:15.71]如果那两个字没有颤抖
[00:19.46]我不会发现 我难受
[00:22.70]怎么说出口
[00:26.50]也不过是分手
[00:30.86]如果对于明天没有要求
[00:34.91]牵牵手就像旅游
[00:38.04]成千上万个门口
[00:41.84]总有一个人要先走
[00:47.71]怀抱既然不能逗留
[00:51.09]何不在离开的时候
[00:54.03]一边享受 一边泪流
[01:01.21]十年之前
[01:03.11]我不认识你
[01:05.00]你不属于我
[01:06.96]我们还是一样
[01:09.47]陪在一个陌生人左右
[01:13.27]走过渐渐熟悉的街头
[01:16.64]十年之后
[01:18.56]我们是朋友
[01:20.52]还可以问候
[01:22.56]只是那种温柔
[01:24.88]再也找不到拥抱的理由
[01:28.76]情人最后难免沦为朋友
[01:57.35]怀抱既然不能逗留
[02:00.59]何不在离开的时候
[02:03.65]一边享受 一边泪流
[02:10.93]十年之前
[02:12.84]我不认识你
[02:14.74]你不属于我
[02:16.71]我们还是一样
[02:19.04]陪在一个陌生人左右
[02:22.90]走过渐渐熟悉的街头
[02:26.32]十年之后 我们是朋友
[02:30.13]还可以问候 只是那种温柔
[02:34.57]再也找不到拥抱的理由
[02:38.42]情人最后难免沦为朋友
[02:48.38]直到和你做了多年朋友
[02:52.37]才明白我的眼泪
[02:55.45]不是为你而流
[02:59.19]也为别人而流
[03:03.00]`)

console.warn(data)