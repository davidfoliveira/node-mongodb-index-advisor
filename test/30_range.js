var
	advisor = require('../index-advisor');

advisor.setIndexes("test",{
	"URL_1":									{ URL: 1 },
	"URL_1_Position_1_Category_Name_1":			{ URL: 1, Position: 1, "Category.Name": 1 },
	"URL_1_Position_1":							{ URL: 1, Position: 1 },
	"URL_1_Position_1_ID_1_Category_Name_1":	{ URL: 1, Position: 1, ID: 1, "Category.Name": 1 },
});

advisor.setArrayFields("test",["Category"]);

var advice = advisor.adviseIndexFor("test",{URL:"http://www.google.pt/","Category.Name":"Economy"},[['Position',1]]);
if ( !advice ) {
	console.log("1 fixedValueField+Sort: Failed - couldn't advise any index");
	return process.exit(-1);
}

if ( advice.indexID == "URL_1_Position_1_Category_Name_1" ) {
	console.log("1 fixedValueField+Sort: OK");
	return process.exit(0);
}
else {
	console.log("1 fixedValueField+Sort: Failed - advised the wrong index ("+advice.indexID+")");
	return process.exit(-1);
}
