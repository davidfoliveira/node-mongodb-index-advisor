var
	advisor = require('../index-advisor');

advisor.setIndexes("test",{
	"URL_1":						{ URL: 1 },
	"URL_1_Position_1_SubPos_1":	{ URL: 1, Position: 1, SubPos: 1 },
	"URL_1_Position_1_Categories_1_SubPos_1":{ URL: 1, Position: 1, Categories: 1, SubPos: 1 },
});

var advice = advisor.adviseIndexFor("test",{URL:"http://www.google.pt/"},[['Position',1],['SubPos',1]]);
if ( !advice ) {
	console.log("1 fixedValueField+Sort: Failed - couldn't advise any index");
	return process.exit(-1);
}

if ( advice.indexID == "URL_1_Position_1_SubPos_1" ) {
	console.log("1 fixedValueField+Sort: OK");
	return process.exit(0);
}
else {
	console.log("1 fixedValueField+Sort: Failed - advised the wrong index");
	return process.exit(-1);
}
