const Seize = require('..');
const jsdom = require('jsdom').jsdom;
const assert = require('chai').assert;
const path = require('path');
const fs = require('fs');
const { beforeEach, describe, it } = require('mocha');


const bulkPath = `${__dirname}/pages-bulk`;
const bulkInputPath = `${bulkPath}/input/`;
const bulkResultPath = `${bulkPath}/result/`;

const jsdomOptions = {
  features: {
    FetchExternalResources: [],
    ProcessExternalResources: false,
  },
};

let subject;

const testCases = [
  {
    name: 'test_attr',
    content: '<article><p>At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti</p><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit</p></article>',
    title: 'Document',
  },
  {
    name: 'test_url',
    content: '<article><img src="http://example.com/image.gif" alt=""><a href="http://example.com/cat/"><img src="http://example2.com/image.gif" alt=""></a><img src="http://example.com/cat/111/image.gif" alt=""><a href="http://example.com/cat/post2"><img src="http://example.com/cat/image.gif" alt=""></a><a href="#hash-link">Link content</a> Lorem ipsum dolor sit amet, consectetur adipiscing elit\n    <h1><a href="">JS link text</a>. Common text.</h1><p>Wow! <a href="http://example3.com/">Protocol link text</a>. New paragraph.</p></article>',
    url: 'http://example.com/cat/post',
    title: 'Document',
  },
  {
    name: 'test_h',
    content: 'This is a title\n\nContent\n\nNemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit\n\n',
    url: 'http://example.com',
    title: 'This is a title',
  },
  {
    name: 'test_empty_tags',
    content: '<article><p>Some text</p><br><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit <img src="null.gif"></p><h1>This is a title</h1><p>Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit</p></article>',
    title: 'This is a title',
  },
  {
    name: 'test_unacceptable',
    content: '<article><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua</p><p>Ut enim ad minim veniam</p></article>',
  },
  {
    name: 'cnet_article',
    content: /The new dome-shaped Beoplay A1 is not only {2}the smallest wireless speaker from the Danish company/,
    url: 'http://www.cnet.com/products/b-o-play-beoplay-a1-portable-bluetooth-speaker/',
  },
  {
    name: 'rbc_article',
    content: /Правительство обнародовало постановление([.\s\S]*)июля 2014 года/g,
    url: 'http://www.rbc.ru/politics/22/04/2016/5719babc9a79475f3aab6096',
  },
  {
    name: 'medportal_article',
    content: /В Крыму истек([.\s\S]*)разбирательство уже началось/g,
    url: 'http://medportal.ru/mednovosti/news/2016/04/21/647insuline/',
  },
  {
    name: 'novate_article',
    content: /Чтобы куриные ножки получились сочными([.\s\S]*)Подавайте в теплом виде с лимоном/g,
    url: 'http://www.novate.ru/blogs/220416/36050/',
  },
  {
    name: 'varlamov_article',
    content: /А-А-А-А-А-А([.\s\S]*)Ох/g,
    url: 'http://varlamov.ru/1659825.html',
  },
  {
    name: 'newsru_article',
    content: /Мурманска в Москву([.\s\S]*)ущерб оценивается/g,
    url: '', // can't detect (no link on page)
  },
  {
    name: 'lenta_article',
    content: /Банки могут получить разрешение на выдачу потребительских безналичных ([.\s\S]*)общественных организаций/g,
    url: 'https://lenta.ru/news/2016/04/22/mobilcredits/',
  },
  {
    name: 'iphonehacks',
    content: /Apple co-founder Steve Wozniak believes ([.\s\S]*)via the link below/g,
    url: 'http://www.iphonehacks.com/2016/04/steve-wozniak-believes-apple-should-pay-same-50-tax-rate-he-does.html',
  },
  {
    name: 'buzzfeed',
    content: /When Tania Rodriguez got dressed for work([.\s\S]*)noting that five planets are in retrograde this month/g,
    url: 'https://www.buzzfeed.com/tamerragriffin/heres-how-brooklyn-celebrated-princes-life',
  },
  {
    name: 'sheknows',
    content: /Many of us have woken in the morning to find we([.\s\S]*)ascites and other intestinal tumors/g,
    url: 'http://www.sheknows.com/health-and-wellness/articles/1117959/causes-of-bloating',
  },
  {
    name: 'carscoops',
    content: /Audi has performed a series of visual and technical updates([.\s\S]*)with deliveries to begin this summer/g,
    url: 'http://www.carscoops.com/2016/04/audi-updates-a6-and-a7-for-2017my.html',
  },
  {
    name: '3dnews',
    content: /В нынешнем году темпы роста мирового([.\s\S]*)мобильных устройств и платформ\./g,
    url: 'http://www.3dnews.ru/934306',
  },

];

describe('Seize.Candidate', () => {
  beforeEach(() => {
    const pageFile = 'test_candidate.html';
    const pagePath = path.join(__dirname, 'pages', pageFile);
    const content = fs.readFileSync(pagePath, 'utf8');
    const window = jsdom(content, jsdomOptions).defaultView;

    subject = new Seize(window.document, {});
  });

  it('should throw error (parent is not Seize)', () => {
    assert.throws(() => new Seize.Candidate({}), 'Argument must be Seize');
  });

  it('should throw error (node must be defined)', () => {
    assert.throws(() => new Seize.Candidate(subject, null), 'DOM node must be defined');
  });
});


describe('Seize.utils', () => {
  let utils;
  let window;

  beforeEach(() => {
    const pageFile = 'test_utils.html';
    const pagePath = path.join(__dirname, 'pages', pageFile);
    const content = fs.readFileSync(pagePath, 'utf8');

    window = jsdom(content, jsdomOptions).defaultView;

    subject = new Seize(window.document, {});

    utils = Seize.utils;
  });

  describe('#values()', () => {
    it('should return empty array', () => {
      assert.ok(Array.isArray(utils.values()));
      assert.equal(utils.values().length, 0);
    });

    it('should return array', () => {
      const test = {
        a: 1,
        b: 2,
        c: 3,
        '-': 4,
      };
      const result = utils.values(test);
      assert.ok(Array.isArray(result));
      assert.deepEqual(result, [1, 2, 3, 4]);
    });
  });

  describe('#getXPath()', () => {
    it('should return empty', () => {
      assert.equal(utils.getXPath(), '');
    });

    it('should return empty (null)', () => {
      assert.equal(utils.getXPath(null), '');
    });

    it('should return empty (elements set)', () => {
      const testEl = window.document.getElementsByTagName('article');
      assert.equal(utils.getXPath(testEl), '');
    });

    it('should return xpath', () => {
      const testEl = window.document.getElementsByTagName('article')[0];
      assert.equal(utils.getXPath(testEl), '/html/body/div/article');
    });
  });

  describe('#getXPathScore()', () => {
    const xpath1 = '/html/body/div/article';
    const xpath2 = '/html/body/div[11]/article';
    const xpath3 = '/html/body/div[11]/article[2]/div';
    const xpath4 = '/html';

    it('not a xpath (null)', () => {
      assert.equal(utils.getXPathScore(null), null);
    });

    it('not a xpath (object)', () => {
      assert.equal(utils.getXPathScore({}), null);
    });

    it('not a xpath', () => {
      assert.equal(utils.getXPathScore(), null);
    });

    it('should return score object', () => {
      assert.ok(utils.getXPathScore(xpath1));
      assert.deepEqual(utils.getXPathScore(xpath1), { depth: 4, distance: 1 });
    });

    it('should return score object', () => {
      assert.ok(utils.getXPathScore(xpath2));
      assert.deepEqual(utils.getXPathScore(xpath2), { depth: 4, distance: 11 });
    });

    it('should return score object', () => {
      assert.ok(utils.getXPathScore(xpath3));
      assert.deepEqual(utils.getXPathScore(xpath3), { depth: 5, distance: 13 });
    });

    it('should return score object', () => {
      assert.ok(utils.getXPathScore(xpath4));
      assert.deepEqual(utils.getXPathScore(xpath4), { depth: 1, distance: 1 });
    });
  });
});

describe('Seize', () => {
  describe('instance', () => {
    it('should throw error (empty argument)', () => {
      assert.throws(() => {
        subject = new Seize();
      }, /Argument must be/);
    });

    it('should throw error (string argument)', () => {
      assert.throws(() => {
        subject = new Seize(' ');
      }, /querySelectorAll|querySelector/);
    });

    it('should throw error (array argument)', () => {
      assert.throws(() => {
        subject = new Seize([]);
      }, /querySelectorAll|querySelector/);
    });
  });

  describe('URL resolver', () => {
    it('should resolve relative url', () => {
      const resolveUrl = Seize.prototype.resolveUrl;
      const result = resolveUrl.call({
        url: 'http://example.com/123/',
      }, 'image.jpg');
      assert.equal('http://example.com/123/image.jpg', result);
    });

    it('should resolve absolute url', () => {
      const resolveUrl = Seize.prototype.resolveUrl;
      const result = resolveUrl.call({
        url: 'http://example.com/123/',
      }, '/image.jpg');
      assert.equal('http://example.com/image.jpg', result);
    });

    it('should resolve url from another source', () => {
      const resolveUrl = Seize.prototype.resolveUrl;
      const result = resolveUrl.call({
        url: 'http://example.com/123/',
      }, 'http://example2.com/image.jpg');
      assert.equal('http://example2.com/image.jpg', result);
    });

    it('should resolve javascript url', () => {
      const resolveUrl = Seize.prototype.resolveUrl;
      const result = resolveUrl.call({
        url: 'http://example.com/123/',
      }, 'javascript:alert("Yeah!")');
      assert.equal('', result);
    });
  });

  testCases.forEach((test) => {
    describe.only(`Run ${test.name}`, function testCasesRunner() {
      this.slow(500);
      let pageFile;
      let pagePath;
      let testContent;
      let content;
      let window;


      beforeEach(() => {
        pageFile = `${test.name}.html`;
        pagePath = path.join(__dirname, 'pages', pageFile);
        testContent = test.content;

        content = fs.readFileSync(pagePath, 'utf8');
        window = jsdom(content, jsdomOptions).defaultView;

        subject = new Seize(window.document, {
          // log: console.log
        });
      });

      it('should extract content', () => {
        if (typeof testContent === 'string') {
          if (testContent[0] === '<') {
            assert.equal(testContent, subject.content().outerHTML);
          } else {
            assert.equal(testContent, subject.text());
          }
        } else if (testContent instanceof RegExp) {
          // console.log(seize.text());
          assert.ok(testContent.test(subject.text()));
        } else {
          assert.equal(testContent, subject.content());
        }
      });

      if (test.title) {
        it('should detect page title', () => {
          assert.equal(test.title, subject.title());
        });
      }

      if (test.url) {
        it('should detect page link', () => {
          assert.equal(test.url, subject.url);
        });
      }

      afterEach(() => {
        subject = null;
      });
    });
  });

  // return;

  function text2array(text) {
    return text
      .split('\n\n')
      .map(line => line.trim().replace(/\n[\s\t]*/g, ' '))
      .reduce((lines, line) => {
        if (line) { lines.push(line); }
        return lines;
      }, []);
  }

  describe('Bulk test', () => {
    const inputFileList = fs.readdirSync(bulkInputPath);
    const resultFileList = fs.readdirSync(bulkResultPath);

    const files = inputFileList
      .map((file) => {
        const basename = file.split('.')[0];
        const txtname = `${basename}.txt`;

        if (resultFileList.indexOf(txtname) === -1) {
          return [file, null];
        }

        return [file, txtname];
      })
      .filter(file => file[0].indexOf('.html') > -1);

    // files = files.slice(5, 6);

    files.forEach((paths) => {
      const inputPath = bulkInputPath + paths[0];
      let resultPath = null;
      let result;

      if (paths[1]) { resultPath = bulkResultPath + paths[1]; }

      it(`should meet ${paths[0]} <-> ${paths[1]}`, function bulkTestRunner() {
        this.slow(500);

        const input = fs.readFileSync(inputPath, 'utf8');
        const testDoc = jsdom(input, jsdomOptions).defaultView;
        let resultHtml = resultPath ? fs.readFileSync(resultPath, 'utf8') : null;
        let resultText = '';
        let resultArray = [];
        subject = new Seize(testDoc.document);

        if (resultPath && resultHtml) {
          resultHtml = resultHtml
            .replace(/^URL:\s+(.*)\n/i, '')
            .replace(/<h>/g, '<h1>')
            .replace(/<l>/g, '<li>')
            .split('\n\n')
            .map(line => line
                .replace(/\n/g, ' ')
                .replace(/<([0-9a-z]+)>(.*)/g, '<$1>$2</$1>')
                .replace(/\s+/g, ' '))
            .join('')
            .replace(/[\n\r]/g, '');
          resultHtml = `<html><head></head><body><div>${resultHtml}</div></body></html>`;
          result = jsdom(resultHtml, jsdomOptions).defaultView;
          resultText = subject.text(result.document.body);
        }

        const testText = subject.text();
        const testArray = text2array(testText);
        resultArray = text2array(resultText);

        if (!resultHtml) {
          subject.content();
          assert.equal(subject.result, null);
          return;
        }

        const score1 = testArray.reduce((memo, item, index) => {
          if (resultArray.indexOf(item) >= index) { return memo + 1; }
          return memo;
        }, 0);

        const score2 = resultArray.reduce((memo, item, index) => {
          if (testArray.indexOf(item) >= index) { return memo + 1; }
          return memo;
        }, 0);

        const rate = (score1 + score2) / (resultArray.length + testArray.length);

        assert.approximately(rate, 0.9, 0.1);
      });
    });
  });
});
