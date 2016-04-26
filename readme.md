# seize

[![Build Status](https://travis-ci.org/peremenov/seize.svg?branch=master)](https://travis-ci.org/peremenov/seize)
[![Dependency Status](https://www.versioneye.com/user/projects/571e32a0fcd19a00454422f0/badge.svg?style=flat)](https://www.versioneye.com/user/projects/571e32a0fcd19a00454422f0)
[![Codacy Badge](https://api.codacy.com/project/badge/grade/4d843a0de0664e3aaba85753ebafeb6b)](https://www.codacy.com/app/peremenov/seize)

---

<!-- ## [по-русски](./readme.ru.md) -->

Seize is light Node or Browser web-page content extractor inspired by [arc90 readability](http://www.arc90.com/work/readability/) and Safari Reader.

## Install

```bash
npm i --save seize
```

## Usage

Seize can be used with DOM libraries such as [jsdom](https://github.com/tmpvar/jsdom) for example. It only extracts and prepares certain DOM-node for further usage.

### Example

```javascript
var Seize = require('seize'),
    jsdom = require('jsdom').jsdom;

var window = jsdom('<your html here>').defaultView,
    seize  = new Seize(window.document);

seize.content(); // returns DOM-node
seize.text();    // returns only text
```


## Browser usage

For browser usage you shoud clone you DOM object or create it from HTML string:

```javascript
/**
 * Converts html string to Document
 * @param  {String} html  html document string
 * @return {Node}         document
 */
function HTMLParser(html){
  var doc = document.implementation.createHTMLDocument("example");
  doc.documentElement.innerHTML = html;
  return doc;
};
```

## How it works

Here is algorythm how it works:

* Getting html tags that we expect to be text or content container such as `p`, `table`, `img`, etc.
* Filtering unnesessary tags by content and tag names wich defenantly can't be in a content container
* Setting score for each container by containing tags
* Setting score by class name, id name, tag xPath score and text score
* Sorting canditates by score
* Taking first candidate
* Cleaning up article

## Todo

**Seize still in development, so you can use it at one's own risk**. You always can help to improve it.

- Improve readme
- Improve text scoring
- Improve page detection wich can't be extracted
- More tests
- More examples

## Contributing

You are welcomed to improve this small piece of software :)

## Author

- [Kir Peremenov](mailto:kirill@peremenov.com)
