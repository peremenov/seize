const Seize = require('..');
const jsdom = require('jsdom').jsdom;
const assert = require('chai').assert;
const path = require('path');
const fs = require('fs');

const jsdomOptions = {
  features: {
    FetchExternalResources: [],
    ProcessExternalResources: false,
  },
};

let subject;

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
      }, 'javascript:alert("Yeah!")'); // eslint-disable-line
      assert.equal('', result);
    });
  });
});
