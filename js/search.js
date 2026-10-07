import { data } from './settings.js?v=3cbb48d67c';

const overlay = document.querySelector('[data-overlay="search"]');
const input = document.querySelector('[data-search-input]');
const resultsBox = document.querySelector('[data-search-results]');
const statusBox = document.querySelector('[data-search-status]');
const config = data.search || {};

let index = null;
let loading = null;
let results = [];
let active = -1;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlight(text, terms) {
  let out = escapeHtml(text);
  terms.forEach(term => {
    if (term.length < 1) return;
    out = out.replace(new RegExp(`(${escapeRegExp(escapeHtml(term))})`, 'gi'), '<mark>$1</mark>');
  });
  return out;
}

function terms(query) {
  return query.toLowerCase().split(/\s+/).map(term => term.trim()).filter(Boolean);
}

function score(item, list) {
  const title = (item.title || '').toLowerCase();
  const tags = (item.tags || []).join(' ').toLowerCase();
  const categories = (item.categories || []).join(' ').toLowerCase();
  const body = `${item.excerpt || ''} ${item.content || ''}`.toLowerCase();

  let total = 0;
  for (const term of list) {
    let hit = 0;
    if (title.includes(term)) hit += 8;
    if (tags.includes(term)) hit += 4;
    if (categories.includes(term)) hit += 3;
    if (body.includes(term)) hit += 1;
    if (!hit) return 0;
    total += hit;
  }
  return total;
}

async function loadIndex() {
  if (index) return index;
  if (loading) return loading;
  loading = fetch(config.url || '/search.json')
    .then(response => (response.ok ? response.json() : []))
    .then(list => {
      index = Array.isArray(list) ? list : [];
      return index;
    })
    .catch(() => {
      index = [];
      return index;
    });
  return loading;
}

function render(list, list_) {
  if (!resultsBox) return;
  if (!list.length) {
    resultsBox.innerHTML = `<p class="search__hint">${escapeHtml(config.empty || '没有找到匹配的内容')}</p>`;
    return;
  }
  resultsBox.innerHTML = list
    .map((entry, i) => {
      const tags = (entry.tags || []).slice(0, 3).map(tag => `<span class="tag">#${escapeHtml(tag)}</span>`).join('');
      return `<a class="search-result${i === active ? ' is-active' : ''}" href="${escapeHtml(entry.url)}" data-index="${i}">
        <span class="search-result__head">
          <span class="search-result__title">${highlight(entry.title, list_)}</span>
          <span class="search-result__date">${escapeHtml(entry.date || '')}</span>
        </span>
        <span class="search-result__excerpt">${highlight(entry.excerpt || '', list_)}</span>
        ${tags ? `<span class="search-result__tags">${tags}</span>` : ''}
      </a>`;
    })
    .join('');
}

function setActive(next) {
  if (!results.length) return;
  active = (next + results.length) % results.length;
  resultsBox.querySelectorAll('.search-result').forEach((el, i) => el.classList.toggle('is-active', i === active));
  const node = resultsBox.querySelector(`.search-result[data-index="${active}"]`);
  if (node) node.scrollIntoView({ block: 'nearest' });
}

async function query(value) {
  const list = terms(value);
  if (!list.length) {
    active = -1;
    results = [];
    if (resultsBox) resultsBox.innerHTML = '<p class="search__hint">输入关键词开始搜索，支持标题、标签与正文。</p>';
    if (statusBox) statusBox.textContent = '';
    return;
  }
  const source = await loadIndex();
  results = source
    .map(item => ({ item, value: score(item, list) }))
    .filter(entry => entry.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, config.limit || 12)
    .map(entry => entry.item);
  active = results.length ? 0 : -1;
  render(results, list);
  if (statusBox) statusBox.textContent = results.length ? `找到 ${results.length} 条结果` : '';
}

export function isSearchOpen() {
  return Boolean(overlay && !overlay.hidden);
}

export async function openSearch() {
  if (!overlay) return;
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  await loadIndex();
  if (input) {
    input.value = '';
    input.focus();
  }
}

export function closeSearch() {
  if (!overlay) return;
  overlay.hidden = true;
  document.body.style.overflow = '';
  active = -1;
}

export function initSearch() {
  if (!overlay) return;
  if (input) {
    let timer = null;
    input.addEventListener('input', () => {
      window.clearTimeout(timer);
      const value = input.value;
      timer = window.setTimeout(() => query(value), 120);
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive(active + 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive(active - 1);
      } else if (event.key === 'Enter') {
        const node = resultsBox && resultsBox.querySelector(`.search-result[data-index="${active}"]`);
        if (node) window.location.href = node.getAttribute('href');
      }
    });
  }
  resultsBox && resultsBox.addEventListener('click', event => {
    const link = event.target.closest('.search-result');
    if (link) closeSearch();
  });
}
