window.Loader = {
  fragment() {
    return document.getElementById('loader-tpl').content.cloneNode(true);
  },
  overlay() {
    const el = document.createElement('div');
    el.className = 'overlay';
    el.appendChild(this.fragment());
    document.body.appendChild(el);
    return el;
  },
};
