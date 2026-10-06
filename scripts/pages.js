'use strict';

// 生成 404.html（GitHub Pages 会直接使用它）
hexo.extend.generator.register('lawson-404', function () {
  return {
    path: '404.html',
    layout: '404',
    data: {
      title: '页面走丢了',
      description: '这个页面不存在，或者已经被移动到别的地方了。'
    }
  };
});
