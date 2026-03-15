async function searchWikipedia(query) {
  try {
    const urlSearch = `https://ca.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json`;
    const resSearch = await fetch(urlSearch);
    const dataSearch = await resSearch.json();

    if (dataSearch.query && dataSearch.query.search.length > 0) {
      const titol = dataSearch.query.search[0].title;
      const urlArticle = `https://ca.wikipedia.org/w/api.php?action=query&prop=extracts&exsentences=5&exlimit=1&titles=${encodeURIComponent(titol)}&explaintext=1&formatversion=2&format=json`;
      const resArticle = await fetch(urlArticle);
      const dataArticle = await resArticle.json();
      return dataArticle.query.pages[0].extract;
    }
    return "No s'ha trobat informació rellevant a internet per respondre això.";
  } catch (e) {
    return "Error accedint a internet.";
  }
}

module.exports = {
  searchWikipedia,
};
