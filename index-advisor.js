"use strict";

var
	indexCache	= {},
	arrayFields	= {};


// Set the indexes for a specific collection
exports.setIndexes = function(collection,indexes) {

	// Parse and cache the indexes
	indexCache[collection] = parseIndexes(indexes);

};


// Load indexes from MongoDB
exports.loadIndexes = function(client,collection,handler) {

	// Get the collection instance
	return client.collection(collection,function(err,col){
		if ( err ) {
			console.log("Error getting MongoDB collection '"+collection+"': ",err);
			return handler(err,null);
		}

		// Get index information
		return col.indexInformation(function(err,indexes){
			if ( err ) {
				console.log("Error getting MongoDB collection '"+collection+"' index information: ",err);
				return handler(err,null);
			}

			// Parse and cache the indexes
			indexCache[collection] = parseIndexes(indexes);
		});
	});

};

// Parse the indexes returned by indexInformation
var parseIndexes = function(indexes,handler) {

	var
		ret  = {};

	for ( var idxName in indexes ) {
		var idx = indexes[idxName];
		if ( idx instanceof Array ) {
			ret[idxName] = {};
			for ( var x = 0 ; x < idx.length ; x++ ) {
				var field = idx[x];
				if ( field instanceof Array ) {
					ret[idxName][field[0]] = field[1];
				}
			}
		}
		else if ( typeof idx == "object" )
			ret[idxName] = idx;
	}

	return ret;

};


// Set the array fields for a specific collection
exports.setArrayFields = function(collection,fieldNames) {

	if ( !(fieldNames instanceof Array) )
		return;

	arrayFields[collection] = fieldNames;

};


// Flush the indexes cache
// Syntax:	flushCache([client][,collection])
exports.flushCache = function(collection){

	var
		args = Array.prototype.slice.call(arguments,0);

	if ( collection )
		delete indexCache[collection];
	else
		indexCache[client] = {};

};


// Find the best index for a query and sort based on conf.indexes
// Syntax:	findBestIndex(collection,query,sort)
// Returns:	index name or null
exports.adviseIndexFor = function(collection,query,sort) {

	var
		self = this,
		fixedValue = {},
		rangeValues = {},
		sortFields = {},
		totalProps = 0,
		indexes = [],
		startDate = new Date(),
		rangeFields = {};

	console.log("Finding the best index for a query on collection '"+collection+"'...");

	// Get indexes for this collection
	indexes = indexCache[collection] || {};
	if ( Object.keys(indexes).length == 0 ) {
		console.log("No indexes for that collection. Skipping!");
		return null;
	}

	// Get fixed and range value properties
	for ( var p in query ) {
		totalProps++;
		if ( typeof(query[p]) != "object" && !isRangeValue(arrayFields[collection],p) )
			fixedValue[p] = query[p];
		else {
			// If query contains a $where, is better not to touch
			if ( query[p]['$where'] ) {
				console.log("Found the $where operator, nothing to advise here.");
				return null;
			}
			rangeValues[p] = query[p];
		}
	}

	// Get sort fields
	if ( sort ) {
		if ( sort instanceof Array ) {
			sort.forEach(function(rule){
				totalProps++;
				if ( rule instanceof Array )
					sortFields[rule[0]] = rule[1];
				else if ( typeof(rule) == "object" ) {
					for ( var f in rule ) {
						if ( rule[f] == 1 || rule[f] == -1 )
						sortFields[f] = rule[f];
						break;
					}
				}
			});
		}
		else if ( typeof(sort) == "object" ) {
			for ( var f in sort ) {
				if ( sort[f] == 1 || sort[f] == -1 ) {
					totalProps++;
					sortFields[f] = sort[f];
				}
			}
		}
	}
	if ( totalProps == 0 ) {
		console.log("Query+Sort have no properties. I can't suggest an index for that.");
		return null;
	}

	// Find a nice index
	var
		idx = findBestIndex(indexes,fixedValue,rangeValues,sortFields,totalProps);

	if ( idx != null ) {
		console.log("Assigning index "+JSON.stringify(idx)+" to the query: ",JSON.stringify({query: query, sort: sort}));
		return idx;
	}

	console.log("Couldn't suggest any index for the supplied query+sort");
	return null;

};

var isRangeValue = function(arrayFieldNames,property) {

	if ( !arrayFieldNames || arrayFieldNames.length == 0 )
		return false;

	for ( var x = 0 ; x < arrayFieldNames.length ; x++ ) {
		var arrayFName = arrayFieldNames[x];
		if ( typeof arrayFName != "string" )
			continue;
		if ( arrayFieldNames[x] == property || (property.length > arrayFName.length && property.substr(0,arrayFName.length+1) == arrayFName+".") )
			return true;
	}

	return false;

}


var findBestIndex = function(indexes,fixedValue,rangeValues,sortFields,totalProps) {

	var
		idxKeys		= Object.keys(indexes),
		bestIdx		= null,
		bestIdxKey	= null,
		bestScore	= 0,
		key,
		index,
		score;
/*
	console.log("fixed: ",fixedValue);
	console.log("range: ",rangeValues);
	console.log("sort:  ",sortFields);
*/
	// Run all indexes
	indexes: for ( var x = 0 ; x < idxKeys.length ; x++ ) {
		key = idxKeys[x];
		index = indexes[key];

//		console.log("\nindex: ",index);
		score = getIndexScore(index,fixedValue,rangeValues,sortFields,totalProps);
//		console.log("SCORE: ",score);

		if ( score > bestScore ) {
			bestIdx = index;
			bestIdxKey = key;
			bestScore = score;
		}
	}

	if ( !bestIdx )
		return null;

	return {
		index: 		bestIdx,
		indexID:	bestIdxKey, 
		score: 		bestScore
	};

};

var getIndexScore = function(index,fixedValue,rangeValues,sortFields,totalQueryProps) {

	// Find the position of each property
	var
		idxPropPos				= {},
		idxPropByPos			= [],
		ppos					= 0,
		totalIndexProps			= 0,
		matchFixed				= {},
		nonMatchFixed			= 0,
		lastFixedMatch			= null,
		lastSortMatch			= null,
		skipProps				= 0,
		alignedSortProperties	= 0,
		alignedRangeProperties	= 0,
		scores					= [100,100,100],
		influence				= [0,0,0],
		hasPart					= [false,false,false],
		score					= 0;

	// Map the field positions on the index
	for ( var p in index ) {
		idxPropPos[p] = ppos++;
		idxPropByPos.push(p);
		totalIndexProps++;
	}

	// Search for fixed value fields on the index
	for ( var p in fixedValue ) {
		if ( idxPropPos[p] != null )
			matchFixed[p] = idxPropPos[p];
		else
			nonMatchFixed++;
	}


	// Has fixed values ?
	if ( Object.keys(fixedValue).length > 0 ) {
		scores[0] = (100*(totalQueryProps-nonMatchFixed))/totalQueryProps;

		// Watch if all the fixed value properties are on the start, if they are not, reduce the score
		// If none of the matched fixed values are on the start, forget it! this index is impossible
		var fixedValueByPos = objMap(matchFixed,function(p,v){return {f:p,pos:idxPropPos[p]}}).sort(function(a,b){return a.pos-b.pos});
		if ( fixedValueByPos.length > 0 && fixedValueByPos[0].pos != 0 ) {
//			console.log("None of the matched fixed value fields are on the start of the index, forget it!");
			return 0;
		}
		for ( var x = 0 ; x < fixedValueByPos.length ; x++ ) {
			if ( x != fixedValueByPos[x].pos ) {
				skipProps = fixedValueByPos.length-x;
				break;
			}
			lastFixedMatch = x;
		}
//		console.log("lastFixedMatch: ",lastFixedMatch);
		scores[0] = (100*(totalQueryProps-nonMatchFixed-skipProps))/totalQueryProps;
		hasPart[0] = true;
//		console.log("Property match score: ",scores[0]);
	}


	// Watch if the sort properties are immeadiatelly after the last matching fixed property
	if ( Object.keys(sortFields).length > 0 ) {
		var
			firstSortPropPos = (lastFixedMatch != null) ? lastFixedMatch+1 : 0,
			sortFieldsByPos = objMap(sortFields,function(p,v){return {f:p,pos:idxPropPos[p]}}).sort(function(a,b){return a.pos-b.pos});
		for ( var x = 0 ; x < sortFieldsByPos.length ; x++ ) {
			var sortField = sortFieldsByPos[x];
			if ( sortField.pos == null ) {
//				console.log("Sort field "+sortField.f+" is not present");
				break;
			}
			if ( parseInt(x+firstSortPropPos) != sortField.pos ) {
//				console.log("Sort field "+sortField.f+" was supposed to be at pos #"+parseInt(x+firstSortPropPos)+" of the index but was found at #"+sortField.pos);
				break;
			}
			alignedSortProperties++;
			lastSortMatch = x+firstSortPropPos;
		}
		scores[1] = (100*alignedSortProperties)/Object.keys(sortFields).length;
		hasPart[1] = true;
//		console.log("Sort match score: ",scores[1]);
	}

	// Watch if the range value properties are immediatelly after the last matching sort property
	if ( Object.keys(rangeValues).length > 0 ) {
		var
			firstRangePropPos = (lastSortMatch != null) ? lastSortMatch+1 : 0,
			rangeFieldsByPos = objMap(rangeValues,function(p,v){return {f:p,pos:idxPropPos[p]}}).sort(function(a,b){return a.pos-b.pos});
		for ( var x = 0 ; x < rangeFieldsByPos.length ; x++ ) {
			var rangeField = rangeFieldsByPos[x];
			if ( rangeField.pos == null ) {
//				console.log("Range field "+rangeField.f+" is not present");
				break;
			}
			if ( parseInt(x+firstRangePropPos) != rangeField.pos ) {
//				console.log("Range field "+rangeField.f+" was supposed to be at pos #"+parseInt(x+firstRangePropPos)+" of the index but was found at #"+rangeField.pos);
				break;
			}
			alignedRangeProperties++;
		}
		scores[2] = (100*alignedRangeProperties)/Object.keys(rangeValues).length;
		hasPart[2] = true;
//		console.log("Range match score: ",scores[2]);
	}

	// Recalculate influences
	if ( hasPart[0] && hasPart[1] && hasPart[2] )
		influence = [0.25,0.40,0.35];
	else if ( hasPart[0] && hasPart[1] )
		influence = [0.4,0.6,0];
	else if ( hasPart[1] && hasPart[2] )
		influence = [0,0.4,0.6];
	else if ( hasPart[0] && hasPart[2] )
		influence = [0.4,0,0.6];
	else {
		for ( var x = 0 ; x < hasPart.length ; x++ ) {
			influence[x] = hasPart[x] ? 1 : 0;
		}
	}

	// The final score is combined
	score = (scores[0]*influence[0]) + (scores[1]*influence[1]) + (scores[2]*influence[2]);

	return score;

};

var objMap = function(o,fn) {

	var
		ret = [];

	Object.keys(o).forEach(function(p){
		ret.push(fn(p,o[p]));
	});

	return ret;

}

// Return the values of an object
var objValues = function(o) {

	var
		values = [];

	for ( var p in o )
		values.push(o[p]);

	return values;
};
