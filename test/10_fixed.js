var
	advisor = require('../index-advisor');

advisor.setIndexes("test",{
	"isActive_true_URL":	{ isActive: true, URL: 1 },
	"URL_1":				{ URL: 1 },
});

var advice = advisor.adviseIndexFor("test",{URL:"http://www.google.pt/"},[]);
if ( !advice ) {
	console.log("1 fixedValueField: Failed - couldn't advise any index");
	return process.exit(-1);
}

if ( advice.indexID == "URL_1" ) {
	console.log("1 fixedValueField: OK");
	return process.exit(0);
}
else {
	console.log("1 fixedValueField: Failed - advised the wrong index");
	return process.exit(-1);
}
