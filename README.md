Staging deploy to Github Pages
==============================

git checkout gh-pages
git rebase master

jspm bundle index.js --inject --minify

git add config.js build.*
git commit --amend --no-edit
git push github gh-pages --force




Staging bundle for HT
=====================

git checkout gh-pages
git rebase master

jspm bundle-sfx index.js  --inject --minify --global-name GRIMap
