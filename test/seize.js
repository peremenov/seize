var Seize  = require('..'),
    jsdom  = require('jsdom').jsdom,
    assert = require('chai').assert,
    path   = require('path'),
    fs     = require('fs'),
    _      = require('lodash');


var bulkPath = __dirname + '/pages-bulk';
var bulkInputPath  = bulkPath + '/input/';
var bulkResultPath = bulkPath + '/result/';

var jsdomOptions = {
  features: {
    FetchExternalResources: [],
    ProcessExternalResources: false
  }
};

var testCases = [
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
  //   content: null,
  //   url: 'http://www.cnet.com/'
  // },
  {
    name: 'test_attr',
    content: '<article><p>Some text</p><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit</p></article>',
    title: 'Document'
  },
  {
    name: 'test_url',
    content: '<article><img src="http://example.com/image.gif" alt=""><a href="http://example.com/cat/"><img src="http://example2.com/image.gif" alt=""></a><img src="http://example.com/cat/111/image.gif" alt=""><a href="http://example.com/cat/post2"><img src="http://example.com/cat/image.gif" alt=""></a><a href="#hash-link">Link content</a><h1><a href="">JS link text</a>. Common text.</h1><p>Wow! <a href="http://example3.com/">Protocol link text</a>. New paragraph.</p></article>',
    url: 'http://example.com/cat/post',
    title: 'Document'
  },
  {
    name: 'test_h',
    content: 'This is a titleContent',
    url: 'http://example.com',
    title: 'This is a title'
  },
  {
    name: 'test_empty_tags',
    content: '<article><p>Some text</p><br><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit <img src="null.gif"></p><h1>This is a title</h1></article>',
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
    name: 'meddaily_article',
    content: /Новая генная терапия способна помочь детям и молодым людям с тяжелым наследственным иммунодефицитом/g,
    url: 'http://meddaily.ru/article/22apr2016/il2rg'
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
    content: /Apple co-founder ([.\s\S]*)via the link below/g,
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

];

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
          // debug: console.log
        });
      });

      it('sould extract content', function() {
        if ( typeof testContent == 'string' ) {
          if ( testContent.indexOf('<') == 0 ) {
            assert.equal( testContent, seize.content().outerHTML );
          } else {
            assert.equal( testContent, seize.text() );
          }
        } else if ( testContent instanceof RegExp ) {
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
    });

    files.forEach(function(paths) {
      var inputPath  = bulkInputPath + paths[0];
      var resultPath = null;

      if ( paths[1] )
        resultPath = bulkResultPath + paths[1];

      it('should meet ' + paths[0] + ' <-> ' + paths[1], function() {
        var input  = fs.readFileSync(inputPath, 'utf8');
        var result = resultPath ? fs.readFileSync(resultPath, 'utf8') : null;
        var window = jsdom(input, jsdomOptions).defaultView;
        var seize = new Seize(window.document);

        assert.equal(result, seize.text());
      });
    });

  });
});
