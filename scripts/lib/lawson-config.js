'use strict';

/**
 * 把站点 _config.yml 里的 lawson: 节点与内置默认值合并。
 * 这样即使配置文件缺项，主题也不会报错。
 */

const DEFAULT_LINKS = [
  { icon: 'bilibili', label: 'Bilibili', url: '' },
  { icon: 'youtube', label: 'YouTube', url: '' },
  { icon: 'douyin', label: '抖音', url: '' },
  { icon: 'tiktok', label: 'TikTok', url: '' },
  { icon: 'x', label: 'X', url: '' },
  { icon: 'github', label: 'GitHub', url: '' }
];

const DEFAULTS = {
  brand: 'Lawson_Hui的博客',
  hero: {
    title: 'Lawson_Hui的个人博客',
    subtitle: '占位文本 · 正在输入',
    typewriter: {
      enabled: true,
      speed: 95,
      pause: 1800,
      phrases: ['占位文本：正在输入……']
    },
    scroll_hint: '向下滚动'
  },
  avatar: 'img/personal_img/bf4c3759123c6a8a93e6a48a8d4fbbf6.JPG',
  profile: {
    title: '介绍',
    name: 'Lawson_Hui',
    email: '',
    groups: []
  },
  links: DEFAULT_LINKS,
  nav: [
    { label: '首页', url: '' },
    { label: '文章', url: 'archives/' },
    { label: '关于', url: 'about/' }
  ],
  theme: {
    default: 'ba',
    click_fx: true,
    skins: [
      { id: 'ba', short: 'BA', name: 'Blue Archive', tagline: '蔚蓝档案 · 光环之上' },
      { id: 'mc', short: 'MC', name: 'Minecraft', tagline: '我的世界 · 方块之下' }
    ]
  },
  background: {
    random: true,
    dim: 34,
    blur: 0,
    ba: { pc: 'img/bg_img/theme_ba/pc', mobile: 'img/bg_img/theme_ba/mobile' },
    mc: { pc: 'img/bg_img/theme_mc/pc', mobile: 'img/bg_img/theme_mc/mobile' }
  },
  posts: {
    heading: '文章',
    more_text: '查看全部',
    excerpt_length: 150
  },
  settings: {
    title: '设置',
    reset_text: '恢复默认',
    note: '所有设置都保存在这台设备的浏览器里（localStorage），不会上传到服务器。'
  },
  footer: {
    since: 2025,
    text: '',
    icp: '',
    powered_by: true
  }
};

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function merge(base, patch) {
  if (!isPlainObject(patch)) return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = merge(out[key], value);
    } else if (value !== undefined && value !== null) {
      out[key] = value;
    }
  }
  return out;
}

function build(rawConfig) {
  return merge(DEFAULTS, rawConfig || {});
}

module.exports = { DEFAULTS, build, merge };
