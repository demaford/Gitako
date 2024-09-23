RAW_VERSION?=$(shell node scripts/get-version.js)
FULL_VERSION=v$(RAW_VERSION)

pull-icons:
	git clone https://github.com/vscode-icons/vscode-icons.git vscode-icons --depth=1

update-icons:
	cd vscode-icons && git pull
	node scripts/vscode-icons/resolve-languages-map
	node scripts/vscode-icons/generate-icon-index

build:
	yarn build

build-all:
	yarn build:all

test:
	yarn test

upload-for-analytics:
	# make sure sentry can retrieve current commit on remote, push both branch and tag
	git push
	git push --tags
	yarn sentry-cli releases new "$(FULL_VERSION)"
	yarn sentry-cli releases set-commits "$(FULL_VERSION)" --auto
	yarn sentry-cli releases files "$(FULL_VERSION)" upload-sourcemaps dist --no-rewrite
	yarn sentry-cli releases finalize "$(FULL_VERSION)"

compress:
	cd dist && zip -r Gitako-$(FULL_VERSION).zip * -x *.map -x *.DS_Store -x *.zip

compress-firefox:
	cd dist-firefox && zip -r Gitako-$(FULL_VERSION)-firefox.zip * -x *.map -x *.DS_Store -x *.zip

compress-source:
	git archive -o dist/Gitako-$(FULL_VERSION)-source.zip HEAD
	zip dist/Gitako-$(FULL_VERSION)-source.zip .env
	zip -r dist/Gitako-$(FULL_VERSION)-source.zip vscode-icons/icons

release:
	$(MAKE) build-all
	$(MAKE) test
	$(MAKE) upload-for-analytics
	$(MAKE) compress
	$(MAKE) compress-firefox
	$(MAKE) compress-source

release-dry-run:
	$(MAKE) build-all
	$(MAKE) test
	$(MAKE) compress
	$(MAKE) compress-firefox
	$(MAKE) compress-source
