const JOINED_STATUSES = new Set(['member', 'administrator', 'creator'])
const NOT_JOINED_STATUSES = new Set(['left', 'kicked'])

export function extractChannelChatId(rawUrl) {
  if (!rawUrl) return null

  const trimmed = String(rawUrl).trim()

  if (!trimmed) return null

  if (trimmed.startsWith('@')) {
    return trimmed
  }

  if (/^-?\d+$/.test(trimmed)) {
    return trimmed
  }

  const match = trimmed.match(/t\.me\/([A-Za-z0-9_]+)\/?(?:\?.*)?$/i)

  if (!match || !match[1]) return null

  const slug = match[1]

  if (
    slug.toLowerCase() === 'joinchat' ||
    slug.startsWith('+')
  ) {
    return null
  }

  return `@${slug}`
}

export async function getChannelMembershipStatus(botToken, chatId, userId) {
  try {
    const url =
      `https://api.telegram.org/bot${botToken}/getChatMember` +
      `?chat_id=${encodeURIComponent(chatId)}` +
      `&user_id=${encodeURIComponent(userId)}`

    const res = await fetch(url)
    const data = await res.json()

    if (!data.ok) {
      return {
        ok: false,
        description: data.description || 'unknown_error',
      }
    }

    return {
      ok: true,
      status: data.result?.status || null,
    }
  } catch (err) {
    return {
      ok: false,
      description: err.message || 'network_error',
    }
  }
}

export function isConfirmedJoined(status) {
  return JOINED_STATUSES.has(status)
}

export function isConfirmedNotJoined(status) {
  return NOT_JOINED_STATUSES.has(status)
}
