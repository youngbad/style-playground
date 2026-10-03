const form = document.getElementById('quote-form');
const result = document.getElementById('result');
const money = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

form.aircraft.addEventListener('change', () => {
  const seats = +form.aircraft.selectedOptions[0].dataset.seats;
  form.pax.max = seats;
  if (+form.pax.value > seats) form.pax.value = seats;
});
form.aircraft.dispatchEvent(new Event('change'));

function render(q) {
  result.replaceChildren();
  const head = el('div', 'route');
  head.append(el('span', 'icao', q.origin), el('span', 'line'), el('span', 'icao', q.destination));
  result.append(head);
  result.append(el('p', 'muted center', `${q.aircraft} · ${q.distance_nm} nm · ${q.hours} h block · ${q.gallons} gal`));
  const table = el('table');
  q.lines.forEach(l => {
    const tr = el('tr');
    tr.append(el('td', '', l.label), el('td', 'num', money(l.amount)));
    table.append(tr);
  });
  const total = el('tr', 'total');
  total.append(el('td', '', 'Total'), el('td', 'num', money(q.total)));
  table.append(total);
  result.append(table);
  result.append(el('p', 'muted center', `${money(q.per_pax)} per passenger`));
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  const body = {
    aircraft: form.aircraft.value, origin: form.origin.value, destination: form.destination.value,
    pax: form.pax.value, headwind: form.headwind.value, round_trip: form.round_trip.checked,
  };
  result.replaceChildren(Loader.fragment());
  const minDelay = new Promise(r => setTimeout(r, 900));
  try {
    const res = await fetch('/api/quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    await minDelay;
    if (!res.ok) throw new Error(data.error || 'Request failed');
    render(data);
  } catch (err) {
    result.replaceChildren(el('p', 'error', err.message));
  }
});
