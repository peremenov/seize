const assert = require('chai').assert;
const Seize = require('..');
const { JSDOM } = require('jsdom');
const path = require('path');
const fs = require('fs');

const jsdomOptions = {
  features: {
    FetchExternalResources: [],
    ProcessExternalResources: false,
  },
};


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

describe('Pages', () => {
  testCases.forEach((test) => {
    describe(`Run ${test.name}`, function testCasesRunner() {
      let subject;
      let pageFile;
      let pagePath;
      let testContent;
      let content;
      let dom;

      beforeAll(() => {
        pageFile = `${test.name}.html`;
        pagePath = path.join(__dirname, 'pages', pageFile);
        testContent = test.content;

        content = fs.readFileSync(pagePath, 'utf8');
        dom = new JSDOM(content, jsdomOptions);

        subject = new Seize(dom.window.document, {
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

    });
  });
});
