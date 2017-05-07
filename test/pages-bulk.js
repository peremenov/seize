const assert = require('chai').assert;
const Seize = require('..');
const jsdom = require('jsdom').jsdom;
const fs = require('fs');

const bulkPath = `${__dirname}/pages-bulk`;
const bulkInputPath = `${bulkPath}/input/`;
const bulkResultPath = `${bulkPath}/result/`;


const jsdomOptions = {
  features: {
    FetchExternalResources: [],
    ProcessExternalResources: false,
  },
};


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

  let subject;

  let files = inputFileList
    .map((file) => {
      const basename = file.split('.')[0];
      const txtname = `${basename}.txt`;

      if (resultFileList.indexOf(txtname) === -1) {
        return [file, null];
      }

      return [file, txtname];
    })
    .filter(file => file[0].indexOf('.html') > -1);

  files = files.slice(5, 6);

  files.forEach((paths) => {
    const inputPath = bulkInputPath + paths[0];
    let resultPath = null;
    let result;

    if (paths[1]) { resultPath = bulkResultPath + paths[1]; }

    it(`should meet ${paths[0]} <-> ${paths[1]}`, function bulkTestRunner() {
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
