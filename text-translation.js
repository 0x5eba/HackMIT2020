
const LanguageTranslatorV3 = require('ibm-watson/language-translator/v3')
const { IamAuthenticator } = require('ibm-watson/auth')

const languageTranslator = new LanguageTranslatorV3({
    version: '2020-07-07',
    authenticator: new IamAuthenticator({
        apikey: "",
    }),
    url: "https://api.eu-gb.language-translator.watson.cloud.ibm.com/instances/e7a97c73-85cc-4d86-844f-7980d86b6287",
})

translateText = (source, target) => {
    return new Promise((resolve, reject) => {
        if(target === source.languageKey) {
            resolve({
                target: target, 
                translation: source.transcript,
                sender: source.sender,
                date: source.date
            })
        } else {
            languageTranslator.translate({
                text: source.transcript,
                source: source.languageKey,
                target: target
            })
                .then(translation => {
                    resolve({
                        target: target, 
                        translation: translation.result.translations[0].translation,
                        sender: source.sender,
                        date: source.date
                    })
                })
                .catch(err => {
                    reject(err)
                })
        }
    })
}

exports.translateText = translateText