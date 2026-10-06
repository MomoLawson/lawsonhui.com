'use strict';

// 生成静态搜索索引 /search.json（纯前端搜索，不需要后端）。
// 主题里的搜索面板会在第一次打开时才去 fetch 这个文件。

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<figure[\s\S]*?<\/figure>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

hexo.extend.generator.register('lawson-search', function (locals) {
  const posts = locals.posts.sort('-date').toArray();
  const data = posts.map(function (post) {
    const content = stripHtml(post.content);
    return {
      title: post.title || '',
      url: post.path,
      date: post.date ? post.date.format('YYYY-MM-DD') : '',
      categories: (post.categories ? post.categories.toArray() : []).map(function (item) {
        return item.name;
      }),
      tags: (post.tags ? post.tags.toArray() : []).map(function (item) {
        return item.name;
      }),
      excerpt: content.slice(0, 180),
      content: content.slice(0, 1500)
    };
  });

  return {
    path: 'search.json',
    data: JSON.stringify(data)
  };
});
