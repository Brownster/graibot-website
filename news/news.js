const listEl = document.getElementById('auto-news-list');
const statusEl = document.getElementById('news-updated-at');

const formatDate = (isoDate) => {
  if (!isoDate) return 'Date unavailable';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const renderNewsItems = (items) => {
  if (!items || items.length === 0) {
    listEl.innerHTML = '<p class="news-note">No stories available right now. Please check back soon.</p>';
    return;
  }

  listEl.innerHTML = items
    .map(
      (item) => `
        <article class="card news-item">
          <p class="news-source">${formatDate(item.publishedAt)} · ${item.source}</p>
          <h2>
            <a href="${item.link}" target="_blank" rel="noopener noreferrer">${item.title}</a>
          </h2>
        </article>
      `
    )
    .join('');
};

const loadNews = async () => {
  try {
    const response = await fetch('./news-data.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to load news feed: ${response.status}`);
    }

    const payload = await response.json();
    renderNewsItems(payload.items);

    statusEl.textContent = `Last auto-refresh: ${formatDate(payload.generatedAt)}.`;
  } catch (error) {
    listEl.innerHTML =
      '<p class="news-note">Unable to load the automated feed right now. Please refresh or check back soon.</p>';
    statusEl.textContent = 'Auto-refresh status unavailable.';
    console.error(error);
  }
};

loadNews();
