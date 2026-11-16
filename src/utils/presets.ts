export const SAMPLE_IMAGE_GALLERY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>My Pocket Gallery</title>
  <style>
    :root { --bg: #0f1117; --card: #1a1f2b; --accent: #10b981; --text: #f8fafc; --muted: #94a3b8; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); padding: 20px 16px 96px; }
    header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
    h1 { font-size: 20px; margin: 0; }
    .count { font-size: 13px; color: var(--muted); }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .card { aspect-ratio: 1; background: var(--card); border-radius: 14px; overflow: hidden; border: 1px solid rgba(255,255,255,.08); }
    .card img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .empty { text-align: center; color: var(--muted); padding: 48px 20px; background: var(--card); border-radius: 16px; }
    .fab { position: fixed; left: 50%; transform: translateX(-50%); bottom: 24px; padding: 14px 26px; border: 0; border-radius: 999px; background: var(--accent); color: #fff; font-size: 15px; font-weight: 700; box-shadow: 0 10px 24px rgba(16,185,129,.35); cursor: pointer; }
  </style>
</head>
<body>
  <header>
    <h1>My Photos</h1>
    <span class="count" id="count">0 photos</span>
  </header>
  <div id="empty" class="empty">Tap "+ Add Photos" below to pick images from your phone gallery.</div>
  <div id="grid" class="grid"></div>
  <button class="fab" onclick="picker.click()">+ Add Photos</button>
  <input id="picker" type="file" accept="image/*" multiple hidden />
  <script>
    const grid = document.getElementById('grid');
    const empty = document.getElementById('empty');
    const count = document.getElementById('count');
    let total = 0;
    document.getElementById('picker').onchange = (e) => {
      for (const file of e.target.files) {
        const card = document.createElement('div');
        card.className = 'card';
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        card.appendChild(img);
        grid.prepend(card);
        total++;
      }
      empty.style.display = total ? 'none' : 'block';
      count.textContent = total + (total === 1 ? ' photo' : ' photos');
      e.target.value = '';
    };
  ${'</' + 'script>'}
</body>
</html>`;

export const SAMPLE_NOTES_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Quick Notes</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; padding: 20px 16px; }
    h1 { font-size: 22px; margin: 0 0 14px; }
    form { display: flex; gap: 8px; margin-bottom: 16px; }
    input { flex: 1; padding: 12px 14px; border-radius: 12px; border: 1px solid #cbd5e1; font-size: 15px; }
    button { padding: 12px 18px; border: 0; border-radius: 12px; background: #4f46e5; color: #fff; font-weight: 600; font-size: 15px; cursor: pointer; }
    .note { display: flex; justify-content: space-between; align-items: center; gap: 12px; background: #fff; padding: 14px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 8px; }
    .del { background: #fee2e2; color: #b91c1c; padding: 6px 10px; font-size: 13px; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>Quick Notes</h1>
  <form id="f">
    <input id="inp" placeholder="Write a note..." required />
    <button type="submit">Add</button>
  </form>
  <div id="list"></div>
  <script>
    const KEY = 'quick_notes_v1';
    let notes = JSON.parse(localStorage.getItem(KEY) || '[]');
    const list = document.getElementById('list');
    function render() {
      localStorage.setItem(KEY, JSON.stringify(notes));
      list.innerHTML = '';
      notes.forEach((n, i) => {
        const div = document.createElement('div');
        div.className = 'note';
        const span = document.createElement('span');
        span.textContent = n;
        const btn = document.createElement('button');
        btn.className = 'del';
        btn.textContent = 'Delete';
        btn.onclick = () => { notes.splice(i, 1); render(); };
        div.append(span, btn);
        list.appendChild(div);
      });
    }
    document.getElementById('f').onsubmit = (e) => {
      e.preventDefault();
      const v = document.getElementById('inp').value.trim();
      if (v) { notes.unshift(v); document.getElementById('inp').value = ''; render(); }
    };
    render();
  ${'</' + 'script>'}
</body>
</html>`;
