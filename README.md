# Style Playground (HangarRate)

Flask + vanilla JS/CSS sandbox for experimenting with UI styles and animations,
built around a General Aviation trip-pricing tool.

```
pip install -r requirements.txt
python app.py          # http://127.0.0.1:5000
pytest
```

- `/` pricing calculator (aircraft, airports, fuel, landing fees)
- `/playground` gallery of loaders (globe orbit, runway) and components; add cards in `templates/playground.html`
- Data lives in `data.py`, pricing logic in `pricing.py`, styles in `static/css/style.css`
