from pathlib import Path

from app.scraper.extract import extract_html


def test_extract_keeps_metadata_json_ld_and_accordion() -> None:
    html = (Path(__file__).parent / "fixtures" / "product.html").read_text(encoding="utf-8")
    result = extract_html(html)
    assert result.title == "Example serum"
    assert result.description == "A simple product description."
    assert result.canonical_url == "https://example.com/products/serum"
    assert result.structured["json_ld"][0]["@type"] == "Product"
    assert "Apply once each evening" in result.text
    assert len(result.content_hash) == 64


def test_extract_keeps_aria_controlled_accordion_content_and_drops_cookie_copy() -> None:
    result = extract_html("""
      <html><head><title>Help</title></head><body>
        <nav>Repeated navigation words</nav><div class='cookie-banner'>Cookie preference copy</div>
        <main><h1>Shipping help</h1><p>Orders leave our warehouse in two business days.</p>
        <button aria-controls='returns-panel'>What is your returns window?</button>
        <section id='returns-panel' hidden>Returns are accepted within thirty days.</section></main>
      </body></html>
    """)
    assert "What is your returns window?" in result.text
    assert "Returns are accepted within thirty days." in result.text
    assert "Repeated navigation words" not in result.text
    assert "Cookie preference copy" not in result.text
