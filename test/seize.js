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

const testCases = [
  // {
  //   name: 'cnet_list',
  //   content: null,
  //   url: 'http://www.cnet.com/topics/appliances/how-to/'
  // },
  // {
  //   name: 'forbes',
  //   content: /Blockchain will do for business transactions what([.\s\S]*)Facebook of the transaction universe/g,
  //   url: 'http://www.forbes.com/sites/sap/2016/04/22/blockchain-digital-business-disruptor-or-doomed-to-oblivion/'
  // },
  // {
  //   name: 'cnet_main',
  //   content: /Latest stories \n\nB&O Play\'s Beoplay A1 mini Bluetooth([.\s\S]*)/g,
  //   url: 'http://www.cnet.com/'
  // },
  {
    name: 'test_attr',
    content: '<article><p>At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti</p><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit</p></article>',
    title: 'Document'
  },
  {
    name: 'test_url',
    content: '<article><img src="http://example.com/image.gif" alt=""><a href="http://example.com/cat/"><img src="http://example2.com/image.gif" alt=""></a><img src="http://example.com/cat/111/image.gif" alt=""><a href="http://example.com/cat/post2"><img src="http://example.com/cat/image.gif" alt=""></a><a href="#hash-link">Link content</a> Lorem ipsum dolor sit amet, consectetur adipiscing elit\n    <h1><a href="">JS link text</a>. Common text.</h1><p>Wow! <a href="http://example3.com/">Protocol link text</a>. New paragraph.</p></article>',
    url: 'http://example.com/cat/post',
    title: 'Document'
  },
  {
    name: 'test_h',
    content: 'This is a title\n\nContent\n\nNemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit\n\n',
    url: 'http://example.com',
    title: 'This is a title'
  },
  {
    name: 'test_empty_tags',
    content: '<article><p>Some text</p><br><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit <img src="null.gif"></p><h1>This is a title</h1><p>Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit</p></article>',
    title: 'This is a title'
  },
  {
    name: 'test_unacceptable',
    content: '<article><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua</p><p>Ut enim ad minim veniam</p></article>',
  },
  {
    name: 'cnet_article',
    content: /The new dome-shaped Beoplay A1 is not only  the smallest wireless speaker from the Danish company/,
    url: 'http://www.cnet.com/products/b-o-play-beoplay-a1-portable-bluetooth-speaker/'
  },
  {
    name: 'rbc_article',
    content: /Правительство обнародовало постановление([.\s\S]*)июля 2014 года/g,
    url: 'http://www.rbc.ru/politics/22/04/2016/5719babc9a79475f3aab6096'
  },
  {
    name: 'medportal_article',
    content: /В Крыму истек([.\s\S]*)разбирательство уже началось/g,
    url: 'http://medportal.ru/mednovosti/news/2016/04/21/647insuline/'
  },
  {
    name: 'novate_article',
    content: /Чтобы куриные ножки получились сочными([.\s\S]*)Подавайте в теплом виде с лимоном/g,
    url: 'http://www.novate.ru/blogs/220416/36050/'
  },
  {
    name: 'varlamov_article',
    content: /А-А-А-А-А-А([.\s\S]*)Ох/g,
    url: 'http://varlamov.ru/1659825.html'
  },
  {
    name: 'newsru_article',
    content: /Мурманска в Москву([.\s\S]*)ущерб оценивается/g,
    url: '' // can't detect (no link on page)
  },
  {
    name: 'lenta_article',
    content: /Банки могут получить разрешение на выдачу потребительских безналичных ([.\s\S]*)общественных организаций/g,
    url: 'https://lenta.ru/news/2016/04/22/mobilcredits/'
  },
  {
    name: 'iphonehacks',
    content: /Apple co-founder Steve Wozniak believes ([.\s\S]*)via the link below/g,
    url: 'http://www.iphonehacks.com/2016/04/steve-wozniak-believes-apple-should-pay-same-50-tax-rate-he-does.html'
  },
  {
    name: 'buzzfeed',
    content: /When Tania Rodriguez got dressed for work([.\s\S]*)noting that five planets are in retrograde this month/g,
    url: 'https://www.buzzfeed.com/tamerragriffin/heres-how-brooklyn-celebrated-princes-life'
  },
  {
    name: 'sheknows',
    content: /Many of us have woken in the morning to find we([.\s\S]*)ascites and other intestinal tumors/g,
    url: 'http://www.sheknows.com/health-and-wellness/articles/1117959/causes-of-bloating'
  },
  {
    name: 'carscoops',
    content: /Audi has performed a series of visual and technical updates([.\s\S]*)with deliveries to begin this summer/g,
    url: 'http://www.carscoops.com/2016/04/audi-updates-a6-and-a7-for-2017my.html'
  },
  {
    name: '3dnews',
    content: /В нынешнем году темпы роста мирового([.\s\S]*)мобильных устройств и платформ\./g,
    url: 'http://www.3dnews.ru/934306'
  },

];

describe('Seize.Candidate', function() {
  let seize;

  beforeEach(() => {
    const pageFile = 'test_candidate.html';
    const pagePath = path.join(__dirname, 'pages', pageFile);
    const content = fs.readFileSync(pagePath, 'utf8');
    const window = jsdom(content, jsdomOptions).defaultView;

    seize = new Seize(window.document, {});
  });

  it('should throw error (parent is not Seize)', function() {
    assert.throws(function() {
      new Seize.Candidate({});
    }, 'Argument must be Seize');
  });

  it('should throw error (node must be defined)', function() {
    assert.throws(function() {
      new Seize.Candidate(seize, null);
    }, 'DOM node must be defined');
  });


});


describe.only('Seize.utils', function() {
  let seize, utils, window;

  beforeEach(() => {
    const pageFile = 'test_utils.html';
    const pagePath = path.join(__dirname, 'pages', pageFile);
    const content = fs.readFileSync(pagePath, 'utf8');

    window = jsdom(content, jsdomOptions).defaultView;

    seize = new Seize(window.document, {});

    utils = Seize.utils;
  });

  describe('#values()', function() {
    it('should return empty array', function() {
      assert.ok(Array.isArray(utils.values()));
      assert.equal(utils.values().length, 0);
    });

    it('should return array', function() {
      var test = {
        a: 1,
        b: 2,
        c: 3,
        '-': 4
      };
      var result = utils.values(test);
      assert.ok(Array.isArray(result));
      assert.deepEqual(result, [ 1, 2, 3, 4 ]);
    });
  });

  describe('#getXPath()', function() {
    it('should return empty', function() {
      assert.equal(utils.getXPath(), '');
    });

    it('should return empty (null)', function() {
      assert.equal(utils.getXPath(null), '');
    });

    it('should return empty (elements set)', function() {
      var testEl = window.document.getElementsByTagName('article');
      assert.equal(utils.getXPath(testEl), '');
    });

    it('should return xpath', function() {
      var testEl = window.document.getElementsByTagName('article')[0];
      assert.equal(utils.getXPath(testEl), '/html/body/div/article');
    });
  });

  describe('#getXPathScore()', function() {
    var testEl,
        xpath1 = '/html/body/div/article',
        xpath2 = '/html/body/div[11]/article',
        xpath3 = '/html/body/div[11]/article[2]/div',
        xpath4 = '/html';

    it('not a xpath (null)', function() {
      assert.equal(utils.getXPathScore(null), null);
    });

    it('not a xpath (object)', function() {
      assert.equal(utils.getXPathScore({}), null);
    });

    it('not a xpath', function() {
      assert.equal(utils.getXPathScore(), null);
    });

    it('should return score object', function() {
      assert.ok(utils.getXPathScore(xpath1));
      assert.deepEqual(utils.getXPathScore(xpath1), {depth:4,distance:1});
    });

    it('should return score object', function() {
      assert.ok(utils.getXPathScore(xpath2));
      assert.deepEqual(utils.getXPathScore(xpath2), {depth:4,distance:11});
    });

    it('should return score object', function() {
      assert.ok(utils.getXPathScore(xpath3));
      assert.deepEqual(utils.getXPathScore(xpath3), {depth:5,distance:13});
    });

    it('should return score object', function() {
      assert.ok(utils.getXPathScore(xpath4));
      assert.deepEqual(utils.getXPathScore(xpath4), {depth:1,distance:1});
    });

  });
});

describe('Seize', function() {

  it('should throw error (empty argument)', function() {
    assert.throws(function() {
      new Seize();
    }, /Argument must be/);
  });

  it('should throw error (string argument)', function() {
    assert.throws(function() {
      new Seize(' ');
    }, /querySelectorAll|querySelector/);
  });

  it('should throw error (array argument)', function() {
    assert.throws(function() {
      new Seize([]);
    }, /querySelectorAll|querySelector/);
  });

  describe('Resolve url', function () {
    it('relative url', function() {
      var resolveUrl = Seize.prototype.resolveUrl;
      var result = resolveUrl.call({
        url: 'http://example.com/123/'
      }, 'image.jpg');
      assert.equal('http://example.com/123/image.jpg', result);
    });

    it('absolute url', function() {
      var resolveUrl = Seize.prototype.resolveUrl;
      var result = resolveUrl.call({
        url: 'http://example.com/123/'
      }, '/image.jpg');
      assert.equal('http://example.com/image.jpg', result);
    });

    it('url from another source', function() {
      var resolveUrl = Seize.prototype.resolveUrl;
      var result = resolveUrl.call({
        url: 'http://example.com/123/'
      }, 'http://example2.com/image.jpg');
      assert.equal('http://example2.com/image.jpg', result);
    });

    it('javascript url', function() {
      var resolveUrl = Seize.prototype.resolveUrl;
      var result = resolveUrl.call({
        url: 'http://example.com/123/'
      }, 'javascript:alert("Yeah!")');
      assert.equal('', result);
    });
  });

  testCases.forEach(function(test) {
    var pageFile = test.name + '.html',
        pagePath = path.join(__dirname, 'pages', pageFile),
        testContent = test.content;

    var content = fs.readFileSync(pagePath, 'utf8'),
        window = jsdom(content, jsdomOptions).defaultView,
        seize;

    describe('Run ' + test.name, function() {
      this.slow(500);

      it('should init without errors', function() {
        seize = new Seize(window.document, {
          // log: console.log
        });
      });

      it('sould extract content', function() {
        if ( typeof testContent == 'string' ) {
          if ( testContent[0] == '<' ) {
            assert.equal( testContent, seize.content().outerHTML );
          } else {
            assert.equal( testContent, seize.text() );
          }
        } else if ( testContent instanceof RegExp ) {
          // console.log(seize.text());
          assert.ok( testContent.test(seize.text()) );
        } else {
          assert.equal( testContent, seize.content() );
        }
      });

      if ( test.title )
        it('sould detect page title', function() {
          assert.equal(test.title, seize.title());
        });

      if ( test.url )
        it('should detect page link', function() {
          assert.equal(test.url, seize.url);
        });

      after(function() {
        seize = null;
      });
    });

  });

  // return;

  var text2array = function(text) {
    return text
      .split('\n\n')
      .map(function(line) {
        return line.trim().replace(/\n[\s\t]*/g, ' ');
      })
      .reduce(function(lines, line) {
        if ( line )
          lines.push(line);
        return lines;
      }, []);
  };

  describe('Bulk test', function() {
    var inputFileList  = fs.readdirSync(bulkInputPath),
        resultFileList = fs.readdirSync(bulkResultPath),
        files;

    files = inputFileList.map(function(file) {
      var basename = file.split('.')[0];
      var txtname  = basename + '.txt';

      if ( resultFileList.indexOf(txtname) === -1 )
        txtname = null;
      return [ file, txtname ];
    })
    .filter(function(file) {
      return file[0].indexOf('.html') > -1;
    });

    // files = files.slice(5, 6);

    files.forEach(function(paths) {
      var inputPath  = bulkInputPath + paths[0];
      var resultPath = null;

      if ( paths[1] )
        resultPath = bulkResultPath + paths[1];

      it('should meet ' + paths[0] + ' <-> ' + paths[1], function() {
        this.slow(500);

        var input      = fs.readFileSync(inputPath, 'utf8');
        var resultHtml = resultPath ? fs.readFileSync(resultPath, 'utf8') : null;
        var testDoc    = jsdom(input, jsdomOptions).defaultView;
        var resultText = '';
        var testText   = '';
        var resultArray = [];
        var seize = new Seize(testDoc.document);

        if ( resultPath && resultHtml ) {
          resultHtml = resultHtml
            .replace(/^URL:\s+(.*)\n/i, '')
            .replace(/<h>/g, '<h1>')
            .replace(/<l>/g, '<li>')
            .split('\n\n')
            .map(function(line) {
              return line
                .replace(/\n/g, ' ')
                .replace(/<([0-9a-z]+)>(.*)/g, '<$1>$2</$1>')
                .replace(/\s+/g, ' ');
            })
            .join('')
            .replace(/[\n\r]/g, '');
          resultHtml = '<html><head></head><body><div>' + resultHtml + '</div></body></html>';
          result = jsdom(resultHtml, jsdomOptions).defaultView;
          resultText = seize.text(result.document.body);
        }

        testText    = seize.text();
        testArray   = text2array(testText);
        resultArray = text2array(resultText);

        if ( !resultHtml ) {
          seize.content();
          assert.equal(seize.result, null);
          return;
        }

        var score1 = testArray.reduce(function(memo, item, index) {
          if ( resultArray.indexOf(item) >= index )
            memo++;
          return memo;
        }, 0);

        var score2 = resultArray.reduce(function(memo, item, index) {
          if ( testArray.indexOf(item) >= index )
            memo++;
          return memo;
        }, 0);

        var rate = (score1 + score2) / (resultArray.length + testArray.length);

        assert.approximately(rate, 0.9, 0.1);
      });
    });

  });
});
