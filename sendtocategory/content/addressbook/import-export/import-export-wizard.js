var jbCatMan = window.opener.jbCatMan;
var jbCatManWizard = {};
    
let loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"].getService(Components.interfaces.mozIJSSubScriptLoader);
loader.loadSubScript("chrome://sendtocategory/content/parser/csv/csv.js");
//loader.loadSubScript("chrome://sendtocategory/content/parser/vcf/vcard.js");
//loader.loadSubScript("chrome://sendtocategory/content/parser/vcf/vcf.js");

/* TODO 
  - do not export empty cols?
*/





jbCatManWizard.Init = function () {
  
  // Define all allowed file extensions. The XUL wizard MUST contain an landing page for import
  // and export for each extension: CatManWizardImport_EXT and CatManWizardExport_EXT
  jbCatManWizard.filetypes = {};
  jbCatManWizard.filetypes.csv = document.getElementById('sendtocategory.wizard.types.csv').value;
  //jbCatManWizard.filetypes.vcf = document.getElementById('sendtocategory.wizard.types.vcf').value;

  // Define all fields, which are not allowed to be imported/exported, because they are managed by TB itself.
  jbCatManWizard.forbiddenFields = ["DbRowID","RecordKey","LastRecordKey"];
  
  let abManager = Components.classes["@mozilla.org/abmanager;1"].getService(Components.interfaces.nsIAbManager);
  jbCatManWizard.currentAddressBook = abManager.getDirectory(window.opener.GetSelectedDirectory()); //GetSelectedDirectory() returns an URI, but we need the directory itself
  jbCatManWizard.timestamp = "Import_" + (new Date()).toISOString().substring(0, 19);
    
  document.getElementById('CatManWizardExport_Categories_CSV').hidden = (jbCatMan.data.selectedCategory == "");

  if (jbCatMan.data.selectedCategoryType == "category") {
    //user selected a category
    if (jbCatMan.data.foundCategories[jbCatMan.data.selectedCategory]) jbCatManWizard.exportsize = jbCatMan.data.foundCategories[jbCatMan.data.selectedCategory].length;
    else {
      jbCatManWizard.exportsize = 0;
      document.getElementById('CatManWizardMode').children[1].disabled = true;
    }
  } else if (jbCatMan.data.selectedCategoryType == "uncategorized") {
    jbCatManWizard.exportsize = jbCatMan.data.cardsWithoutCategories.length;    
  } else { //all
    jbCatManWizard.exportsize = jbCatMan.data.abSize;
  }


  // Update custom placeholders in locale strings.
  this.replaceCustomStrings(document.getElementById('CatManWizardModeImport'));
  this.replaceCustomStrings(document.getElementById('CatManWizardModeExport'));
  this.replaceCustomStrings(document.getElementById('CatManWizardExportDesc'));
  this.replaceCustomStrings(document.getElementById('CatManWizardImportDesc'));
  
  this.replaceCustomStrings(document.getElementById('CatManWizardExport_Categories_CSV'));

  // Get all options from CatManWizardImportCsvDelimiter Popup.
  elements = document.getElementById('CatManWizardImportCsvDelimiter').children[0].children;
  jbCatManWizard.csvDelimiter = [];
  for (let x=0; x<elements.length ;x++) {
    jbCatManWizard.csvDelimiter.push(elements[x].value);
  }

  // Get all options from CatManWizardImportCsvTextIdentifier Popup.
  elements = document.getElementById('CatManWizardImportCsvTextIdentifier').children[0].children;
  jbCatManWizard.csvTextIdentifier = [];
  for (let x=0; x<elements.length ;x++) {
    jbCatManWizard.csvTextIdentifier.push(elements[x].value);
  }
  
  // Get all options from CatManWizardImportCsvCharset Popup.
  elements = document.getElementById('CatManWizardImportCsvCharset').children[0].children;
  jbCatManWizard.csvCharset = [];
  for (let x=0; x<elements.length ;x++) {
    jbCatManWizard.csvCharset.push(elements[x].value);
  }
}



/* Disable back button on last page */
jbCatManWizard.finishWizard = function () {
  document.documentElement.getButton("back").hidden=true;
  document.documentElement.getButton("cancel").hidden=true;
}


jbCatManWizard.reset = function () {
    jbCatManWizard.fileObj = null;
}

/* Do things on hitting advance button */
jbCatManWizard.onpageadvanced = function (curPage) {

  // check if a silent function needs to be called, before leaving the current page 
  // it looks for a function jbCatManWizard.SilentAfter_<currentPage>
  let type = "SilentAfter_" + curPage.pageid.replace("CatManWizard","");
  let typeFunction = this[type]; 
  if (typeof typeFunction === 'function') {
      this.advance = typeFunction();
      if (!this.advance) return false;
  }

  // check if a progress function needs to be called, before leaving the current page 
  // it looks for a function jbCatManWizard.ProgressAfter_<currentPage>
  type = "ProgressAfter_" + curPage.pageid.replace("CatManWizard","");
  typeFunction = this[type]; 
  if (typeof typeFunction === 'function') {
      this.advance = true;
      this.more = true;
      window.openDialog("chrome://sendtocategory/content/addressbook/import-export/progress.xul", "progress-window", "modal,dialog,centerscreen,chrome,resizable=no,width=300, height=20", type);
      if (!this.advance) return false;
  }
  
  //manually set next page from current page (overriding xul settings)
  switch (curPage.pageid) {

    case "CatManWizardMode":
      let nsIFilePicker = Components.interfaces.nsIFilePicker;
      let fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(Components.interfaces.nsIFilePicker);
      if (document.getElementById('CatManWizardMode').value == "Export") fp.init(window, document.getElementById('sendtocategory.wizard.mode.export.selectfile').value , nsIFilePicker.modeSave);
      else fp.init(window, document.getElementById('sendtocategory.wizard.mode.import.selectfile').value, nsIFilePicker.modeOpen);

      // add all allowed file types
      let extAtIndex = [];
      let ext;
      for (ext in jbCatManWizard.filetypes) {
        fp.appendFilter(jbCatManWizard.filetypes[ext] ,"*." + ext);
        extAtIndex.push(ext);
      }

      //fp.show has been deprecated, and open is async: on initial advanced return false and init filepicker
      //the callback will trigger the advance again
      if (jbCatManWizard.fileObj === null) {

          // determine next XUL page based on filetype selection and load default landing page
          fp.open(function (rv) {
              if (rv != nsIFilePicker.returnCancel) {
                  jbCatManWizard.fileObj = fp.file;
                  document.getElementById('CatManWizard').advance();
              }
            });
          return false;
      }
      
      curPage.next = "CatManWizard" + document.getElementById('CatManWizardMode').value + "_" + extAtIndex[fp.filterIndex].toUpperCase();

    break;

  }

  // check if a silent function needs to be called, before loading the next page 
  // it looks for a function jbCatManWizard.SilentBefore_<nextPage>
  type = "SilentBefore_" + curPage.next.replace("CatManWizard","");
  typeFunction = this[type]; 
  if (typeof typeFunction === 'function') {
      this.advance = typeFunction();
      if (!this.advance) return false;
  }

  // check if a progress function needs to be called, before loading the next page 
  // it looks for a function jbCatManWizard.ProgressBefore_<nextPage>
  type = "ProgressBefore_" + curPage.next.replace("CatManWizard","");
  typeFunction = this[type]; 
  if (typeof typeFunction === 'function') {
      this.advance = true;
      this.more = true;
      window.openDialog("chrome://sendtocategory/content/addressbook/import-export/progress.xul", "progress-window", "modal,dialog,centerscreen,chrome,resizable=no,width=300, height=20", type);
      if (!this.advance) return false;
  }

  //default = allow advancing to next page
  return true;
}










/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 * USAGE INSTRUCTIONS FOR SILENT FUNCTIONS AND PROGRESS FUNCTIONS:
 * - each silentTypeFunction() must return either true or false, to indicate, 
 *   wether it is allowed to advance to the next wizard page or not
 * - each progressTypeFunction(dialog) must eventually call dialog.done(true/false)
 *   at some point, to close the dialog and to allow or to disallow advancing to the 
 *   next wizard page. 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */



/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 * CSV IMPORT FUNCTIONS 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

jbCatManWizard.ProgressBefore_Import_CSV = function (dialog, step = 0) {
  step = step + 1;
  
  switch (step) {
    case 1:
      //read CSV file with guessed charset - use the first one, that does not return an empty string
      {
        let guess = 0;
        let count = 0;
        for (let x=0; x<jbCatManWizard.csvCharset.length && count == 0; x++) {
          jbCatManWizard.fileContent = jbCatManWizard.readFile(jbCatManWizard.fileObj, jbCatManWizard.csvCharset[x]);
          count = jbCatManWizard.fileContent.trim().length;
          guess = x;
        }
        //set xul field to guess
        document.getElementById('CatManWizardImportCsvCharset').selectedIndex = guess;
      }
    break;
    
    case 2:
      //guess delim
      {
        let guess = 0;
        let count = 0;
        for (let x=0; x<jbCatManWizard.csvDelimiter.length ;x++) {
          let c = jbCatManWizard.fileContent.split(jbCatManWizard.csvDelimiter[x]).length;
          if (c>count) {count = c; guess= x; } 
        }
        //set xul field to guess
        document.getElementById('CatManWizardImportCsvDelimiter').selectedIndex = guess;
      }
      break;
    
    case 3:
      //guess TextIdentifier
      {
        let guess = 0;
        let count = 0;
        for (let x=0; x<jbCatManWizard.csvTextIdentifier.length ;x++) {
          let c = jbCatManWizard.fileContent.split(jbCatManWizard.csvTextIdentifier[x]).length;
          if (c>count) {count = c; guess= x; } 
        }
        //set xul field to guess
        document.getElementById('CatManWizardImportCsvTextIdentifier').selectedIndex = guess;
      }
      break;

    case 4:
      //done
      dialog.done(true);
    break;
  }

  if (jbCatManWizard.more) {
      dialog.setProgressBar((step*100)/4);
      dialog.window.setTimeout(function() { jbCatManWizard.ProgressBefore_Import_CSV(dialog, step); }, 100);
  }
}


/* extract cvs fields and prepare XUL fields list */
jbCatManWizard.ProgressBefore_Import_Mapping_CSV = function (dialog, step = 0) {
  step = step + 1;

  switch (step) {
    case 1:
      //re-read file with selected encoding
      jbCatManWizard.fileContent = jbCatManWizard.readFile(jbCatManWizard.fileObj, document.getElementById("CatManWizardImportCsvCharset").value);
      if (jbCatManWizard.fileContent.trim().length == 0) {
        alert(document.getElementById('sendtocategory.wizard.import.error.empty').value);
        dialog.done(false);
      }
    break;

    case 2:
      //parse file with selected options
      jbCatManWizard.csv = new CSVParser(jbCatManWizard.fileContent, {textIdentifier : jbCatManWizard.csvTextIdentifier[document.getElementById('CatManWizardImportCsvTextIdentifier').selectedIndex], fieldSeparator : jbCatManWizard.csvDelimiter[document.getElementById('CatManWizardImportCsvDelimiter').selectedIndex], strict : true,  ignoreEmpty: true});
      try {jbCatManWizard.csv.parse();} catch (e) {alert (document.getElementById('sendtocategory.wizard.import.error.csv').value); dialog.done(false);}
    break;

    case 3:
      // Get  standard thunderbird fields defined in XUL  - https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/nsIAbCard_(Tb3)
      jbCatManWizard.standardFields = [];
      for (let c=0; c<document.getElementById('CatManImportDataFieldListTemplate').childNodes[1].childNodes[0].itemCount; c++)
      {
        let item = document.getElementById('CatManImportDataFieldListTemplate').childNodes[1].childNodes[0].getItemAtIndex(c).label;
        jbCatManWizard.standardFields.push(item);
      }
    break;
      
    case 4:
      //extract all data fields from import file
      jbCatManWizard.datafields = jbCatManWizard.csv.rows[0];

      // clear list
      {
        let mappingList = document.getElementById("CatManWizardImport_Mapping_CSV");
        for (var i=mappingList.getRowCount() -1; i>=0; i--) {
          mappingList.removeItemAt(i);
        }
      }
      break;

    case 5:
      {
        let mappingList = document.getElementById("CatManWizardImport_Mapping_CSV");
        for (let x=0; x<jbCatManWizard.datafields.length; x++) {
          //copy from template
          let newListEntry = document.getElementById("CatManImportDataFieldListTemplate").cloneNode(true);
          newListEntry.removeAttribute("id");
          newListEntry.removeAttribute("current");
          newListEntry.removeAttribute("selected");

          //append selected field, if not in standardFields
          let itemIndex = jbCatManWizard.standardFields.indexOf(jbCatManWizard.datafields[x]);
          if (itemIndex == -1)
          {
            let menuItem = document.createElement("menuitem");
            menuItem.setAttribute("label", jbCatManWizard.datafields[x]);
            newListEntry.childNodes[1].childNodes[0].childNodes[0].appendChild(menuItem);
            itemIndex = jbCatManWizard.standardFields.length;
          }
          newListEntry.childNodes[1].childNodes[0].childNodes[0].childNodes[itemIndex].setAttribute("selected", "true");
          newListEntry.childNodes[1].childNodes[0].childNodes[0].childNodes[itemIndex].setAttribute("style", "font-weight:bold;")
          newListEntry.childNodes[0].childNodes[0].setAttribute("value",jbCatManWizard.datafields[x]);
          mappingList.appendChild(newListEntry);
        }
      }
      break;
      
    case 6:
      //done
      dialog.done(true);
    break;
  }
  
  if (jbCatManWizard.more) {
    dialog.setProgressBar((step*100)/6);
    dialog.window.setTimeout(function() { jbCatManWizard.ProgressBefore_Import_Mapping_CSV(dialog, step); }, 100);
  }
}


jbCatManWizard.SilentAfter_Import_Mapping_CSV = function () {
  //check user selection of import mapping for forbidden fields
  let mappingList = document.getElementById("CatManWizardImport_Mapping_CSV");
  jbCatManWizard.importMap = {};
    
  //keep track, if Categories field has been added to the map
  let foundCategoriesField = false;
    
  for (var i=mappingList.getRowCount() -1; i>=0; i--) {
    let v = mappingList.getItemAtIndex(i).childNodes[1].childNodes[0].label;
    let c = mappingList.getItemAtIndex(i).childNodes[2].childNodes[0].checked;
    if (c && jbCatManWizard.forbiddenFields.indexOf(v) != -1)
    {
      alert(document.getElementById('sendtocategory.wizard.import.error.reserved').value.replace("##fieldname##",v));
      return false;
    }
    //add fields to header for import - mapout the used fields
    if (c) {
      jbCatManWizard.importMap[i] = v;
      if (v == jbCatMan.getCategoryField()) foundCategoriesField = true;
    }
  }

  //verify that Categories field is present, even though it might not be in the data
  //an index of -1 means, there is no data for that field and we have pass it on thy fly - see getFieldValue4Import
  if (!foundCategoriesField) jbCatManWizard.importMap[-1] = jbCatMan.getCategoryField();

  jbCatManWizard.importControlView.init("elementList", jbCatManWizard.csv.rows, jbCatManWizard.importMap);
  return true;
}

/* actual import */
jbCatManWizard.ProgressAfter_Import_Control_CSV = function (dialog, step = 0) {
  step = step + 1;
  if (step > jbCatManWizard.csv.numberOfRows()) {
    //after import is done, update number of imported contacts, header row does not count and is skipped
    document.getElementById('CatManWizardImportDesc').textContent = document.getElementById('CatManWizardImportDesc').textContent.replace("##IMPORTNUM##",jbCatManWizard.csv.numberOfRows()-1);
    dialog.done(true);
  } else {
    dialog.setProgressBar(100*step/jbCatManWizard.csv.numberOfRows());

    //get dataset, skip header (by skipping step == 0)
    let data = jbCatManWizard.csv.rows[step];
 
    if (data) {
      let card = Components.classes["@mozilla.org/addressbook/cardproperty;1"].createInstance(Components.interfaces.nsIAbCard);
      for (var p in jbCatManWizard.importMap) {
        let prop = jbCatManWizard.importMap[p];
        // get field value to import from data (function may manipulate data, used for Categories field)
        let value = jbCatManWizard.getFieldValue4Import(data, p, jbCatManWizard.importMap);
        //do not add empty properties
        if (value.trim() !=  "") card.setProperty(prop, value);
      }
      //add the new card to the book and then call modify, which inits sysnc
      jbCatMan.modifyCard(card);
    }

    dialog.window.setTimeout(function() { jbCatManWizard.ProgressAfter_Import_Control_CSV(dialog, step); }, 20);
  }
}





/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 * CSV EXPORT FUNCTIONS 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

jbCatManWizard.ProgressBefore_Export_CSV = function (dialog, step = 0) {
  //scan to-be-exported contacts and extract all possible properties for csv header

  if (step == 0) {
    //get all to-be-exported contatcs
    let searchstring =  jbCatMan.getCategorySearchString(jbCatManWizard.currentAddressBook.URI, jbCatMan.data.selectedCategory, jbCatMan.data.selectedCategoryType);
    jbCatManWizard.exportCards = Components.classes["@mozilla.org/abmanager;1"].getService(Components.interfaces.nsIAbManager).getDirectory(searchstring).childCards;

    //get all standard thunderbird fields (defined at csv inport wizard page)
    jbCatManWizard.standardFields = [];
    for (let c=0; c<document.getElementById('CatManImportDataFieldListTemplate').childNodes[1].childNodes[0].itemCount; c++)
    {
      let item = document.getElementById('CatManImportDataFieldListTemplate').childNodes[1].childNodes[0].getItemAtIndex(c).label;
      jbCatManWizard.standardFields.push(item);
    }

    //reset list of found props with standard fields
    jbCatManWizard.resetThunderbirdProperties("CatManWizardExport_CSV", jbCatManWizard.standardFields);
  }
  
  step = step + 1;
  if (jbCatManWizard.exportCards.hasMoreElements()) {
    dialog.setProgressBar(100*step/jbCatManWizard.exportsize);

    //scan next found card
    jbCatManWizard.searchThunderbirdProperties(jbCatManWizard.exportCards.getNext().QueryInterface(Components.interfaces.nsIAbCard).properties);
    dialog.window.setTimeout(function() { jbCatManWizard.ProgressBefore_Export_CSV(dialog, step); }, 20);
  } else {
    jbCatManWizard.xuladdThunderbirdProperties("CatManWizardExport_CSV", "CatManExportDataFieldListTemplate", jbCatManWizard.standardFields);
    dialog.done(true);
  }
}


jbCatManWizard.ProgressAfter_Export_CSV = function (dialog, step = 0) {
  //do export
  let delim = document.getElementById("CatManWizardExportCsvDelimiter").value;
  let textident = document.getElementById("CatManWizardExportCsvTextIdentifier").value;
  let linebreak = document.getElementById("CatManWizardExportCsvLinebreak").value.replace("LF","\n").replace("CR","\r");
  let charset = document.getElementById("CatManWizardExportCsvCharset").value;
  
  if (step == 0) {
    //init export file
    jbCatManWizard.initFile(jbCatManWizard.fileObj);
    //get cards to be exported
    let searchstring = jbCatMan.getCategorySearchString(jbCatManWizard.currentAddressBook.URI, jbCatMan.data.selectedCategory, jbCatMan.data.selectedCategoryType);
    jbCatManWizard.exportCards = Components.classes["@mozilla.org/abmanager;1"].getService(Components.interfaces.nsIAbManager).getDirectory(searchstring).childCards;
    //escape header of all fields which need to be exported
    let header = [];
    jbCatManWizard.props2export = [];
    jbCatManWizard.props4export = {};
    let exportList = document.getElementById("CatManWizardExport_CSV");
    for (var i=0; i<exportList.getRowCount(); i++) {
      let v = exportList.getItemAtIndex(i).childNodes[0].childNodes[0].value;
      let c = exportList.getItemAtIndex(i).childNodes[1].childNodes[0].checked;

      //special treatment for Categories, if unchecked but CatManWizardExport_Categories_CSV is checked, do export Categories, but just the selected one
      if (v==jbCatMan.getCategoryField() && !c && jbCatMan.data.selectedCategory !="" && document.getElementById("CatManWizardExport_Categories_CSV").checked) {
        jbCatManWizard.props4export[v] = jbCatMan.data.selectedCategory;
      }
      
      //export property if checked or if a custom export value for that property has been defined
      if (c || jbCatManWizard.props4export[v]) {
        jbCatManWizard.props2export.push(v);
        header.push(jbCatManWizard.csvEscape(v, delim, textident));
      }
    }

    jbCatManWizard.appendFile(header.join(delim)+linebreak, charset);
  }

  step = step + 1;
  if (jbCatManWizard.exportCards.hasMoreElements()) {
    dialog.setProgressBar(100*step/jbCatManWizard.exportsize);
    let card = jbCatManWizard.exportCards.getNext().QueryInterface(Components.interfaces.nsIAbCard);
    //get all properties of card and write it to csv file
    let data = [];
    for (let h=0; h<jbCatManWizard.props2export.length; h++) {
      let field = "";
      try {
        field = card.getPropertyAsAString(jbCatManWizard.props2export[h]);
      } catch(e) {}
      //allow to override export value - crrently used only for Categories
      if (jbCatManWizard.props4export[jbCatManWizard.props2export[h]]) {
        field = jbCatManWizard.props4export[jbCatManWizard.props2export[h]];
      }
      data.push(jbCatManWizard.csvEscape(field, delim, textident));
    }
    jbCatManWizard.appendFile(data.join(delim)+linebreak, charset);
    dialog.window.setTimeout(function() { jbCatManWizard.ProgressAfter_Export_CSV(dialog, step); }, 20);
  } else {
    //close csv file
    jbCatManWizard.closeFile();
    //update number of exported contacts
    document.getElementById('CatManWizardExportDesc').textContent = document.getElementById('CatManWizardExportDesc').textContent.replace("##EXPORTNUM##",step-1);
    dialog.done(true);
  }
}



/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 * VCF IMPORT FUNCTIONS 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

/*
  VCF.parse("BEGIN:VCARD\r\n" +
    "VERSION:4.0\r\n" +
    "FN:My formatted name\r\n" +
    "END:VCARD\r\n", function(vcard) {
  // this function is called with a VCard instance.
  // If the input contains more than one vCard, it is called multiple times.
  dump("Formatted name: " + vcard.fn + "\n");
  dump("Names: " + vcard.n + "\n");
  });

*/

jbCatManWizard.ProgressBefore_Import_VCF = function (dialog, step = 0) {
  //demo progressbar
  step = step + 1;
  if (step > 100) dialog.done(true);
  else {
    dialog.setProgressBar(step);
    dialog.window.setTimeout(function() { jbCatManWizard.ProgressBefore_Import_VCF(dialog, step); }, 1000);
  }
}










/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 * HELPER FUNCTIONS 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

jbCatManWizard.replaceCustomStrings = function (element) {
  let desc = "";
  if (element.tagName.toLowerCase() == "description") desc = element.textContent ;
  else desc = element.label;

  desc = desc.replace("##NUM##", jbCatManWizard.exportsize);
  desc = desc.replace("##BOOK##", jbCatManWizard.currentAddressBook.dirName);
  desc = desc.replace("##CAT##", jbCatMan.data.selectedCategory);
  desc = desc.replace("##TIMECAT##", jbCatManWizard.timestamp);
  
  //find category substring
  let p1 = desc.indexOf("{{");
  let p2 = desc.indexOf("}}", p1);
  let s1 = desc.substring(0, p1);
  let s2 = desc.substring(p1+2, p2);
  let s3 = desc.substring(p2+2);

  let newvalue = "";
  if (jbCatMan.data.selectedCategory == "") 
    newvalue = s1 + s3;
  else
    newvalue = s1 + s2 + s3;
  
  if (element.tagName.toLowerCase() == "description") element.textContent = newvalue;
  else element.label = newvalue;
}


// http://forums.mozillazine.org/viewtopic.php?p=13321043#p13321043
jbCatManWizard.readFile = function(file, charset) {
  var response = "";
  var converter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Components.interfaces.nsIScriptableUnicodeConverter);

  if (charset) {
    try {
      converter.charset = charset;
    } catch(e) {
      alert("Error converting from charset <" + charset + ">.");
      return "";
    }
  }
  
  try {
     if (file.exists() && file.isReadable()) {
        var fstream = Components.classes["@mozilla.org/network/file-input-stream;1"].createInstance(Components.interfaces.nsIFileInputStream);
        var sstream = Components.classes["@mozilla.org/scriptableinputstream;1"].createInstance(Components.interfaces.nsIScriptableInputStream);
        fstream.init(file, -1, 0, 0);
        sstream.init(fstream); 
        var str = sstream.read(4096);
        while (str.length > 0) {
           if (charset) response += converter.ConvertToUnicode(str);
           else response += str;
          
           str = sstream.read(4096);
        }
        sstream.close();
        fstream.close();
     }
  }
  catch(e) {};
  return response;
}



jbCatManWizard.initFile = function(file) {
  try {
     jbCatManWizard.stream = Components.classes["@mozilla.org/network/safe-file-output-stream;1"].createInstance(Components.interfaces.nsISafeOutputStream);
     jbCatManWizard.stream.QueryInterface(Components.interfaces.nsIFileOutputStream).init(file, 0x02 | 0x08 | 0x20, 0666, 0); // write, create, truncate, rw-rw-rw-
  } catch(e) {
    alert("Error opening to file.");
    return false;
  }
  return true;
}

jbCatManWizard.appendFile = function(src, charset) {
  /* https://developer.mozilla.org/en-US/docs/Writing_textual_data */
  var converter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
  
  let data = "";  
  try {
    converter.charset = charset;
    data = converter.ConvertFromUnicode(src);
  } catch(e) {
    alert("Error converting to charset <" + charset + ">.");
    return false;
  }

  try {
     jbCatManWizard.stream.write(data, data.length);
  } catch(e) {
    alert("Error writing to file.");
    return false;
  }
  return true;
}

jbCatManWizard.closeFile = function() {
  try {
     jbCatManWizard.stream.finish();
  } catch(e) {
    alert("Error closing to file.");
    return false;
  };
  return true;
}

jbCatManWizard.writeFile = function(file, data) {
  try {
     var stream = Components.classes["@mozilla.org/network/safe-file-output-stream;1"].createInstance(Components.interfaces.nsISafeOutputStream);
     stream.QueryInterface(Components.interfaces.nsIFileOutputStream).init(file, 0x02 | 0x08 | 0x20, 0666, 0); // write, create, truncate, rw-rw-rw-
     stream.write(data, data.length);
     stream.finish();
  }
  catch(e) {};
}


jbCatManWizard.resetThunderbirdProperties = function (listname, defaults) {
  jbCatManWizard.foundThunderbirdProperties = defaults.slice();
  //reset XUL list as well 
  let exportList = document.getElementById(listname);
  for (var i=exportList.getRowCount() -1; i>=0; i--) {
    exportList.removeItemAt(i);
  }
}

jbCatManWizard.searchThunderbirdProperties = function (props) {
  while (props.hasMoreElements()) {
    prop = props.getNext().QueryInterface(Components.interfaces.nsIProperty); 
    if (jbCatManWizard.foundThunderbirdProperties.indexOf(prop.name) == -1 && jbCatManWizard.forbiddenFields.indexOf(prop.name) == -1) { 
      jbCatManWizard.foundThunderbirdProperties.push(prop.name);
    }
  }
}

jbCatManWizard.xuladdThunderbirdProperties = function (listname, template, defaults) {
  //get XUL list which needs to be updated
  let exportList = document.getElementById(listname);
  for (let p=0; p<jbCatManWizard.foundThunderbirdProperties.length; p++) {
    //copy from template
    let newListEntry = document.getElementById(template).cloneNode(true);
    newListEntry.setAttribute("id","CatManListItem_"+listname+"_"+p);
    newListEntry.removeAttribute("current");
    newListEntry.removeAttribute("selected");
    newListEntry.childNodes[0].childNodes[0].setAttribute("value",jbCatManWizard.foundThunderbirdProperties[p]);
    exportList.appendChild(newListEntry);
    if (defaults.indexOf(jbCatManWizard.foundThunderbirdProperties[p]) == -1) {
      document.getElementById("CatManListItem_"+listname+"_"+p).childNodes[0].childNodes[0].style.fontStyle="italic";
      document.getElementById("CatManListItem_"+listname+"_"+p).childNodes[1].childNodes[0].checked=false;
    }
  }
}




jbCatManWizard.togglecheck = function (element, pos) {
  let item = element.getItemAtIndex(element.selectedIndex);
  let c = item.childNodes[pos].childNodes[0].checked;
  item.childNodes[pos].childNodes[0].checked = !c;
}



jbCatManWizard.csvEscape = function (value, delim, textident) {
  //a TextIdentifier is replaced by double TextIdentifiers - do we need to put a TextIdentifier around everything in that case as well? YES!
  let newvalue = value;
  if (newvalue.indexOf(textident) != -1) newvalue = newvalue.split(textident).join(textident+textident);
  if (newvalue.indexOf(delim) != -1 || newvalue.indexOf("\r") != -1 || newvalue.indexOf("\n") != -1 || newvalue.length != value.length) newvalue = textident + newvalue + textident;
  
  return newvalue; 
}



jbCatManWizard.addSelectedCategoryToCategories = function(catstring) {
  let cats = jbCatMan.getCategoriesFromString(catstring);
  if (cats.indexOf(jbCatMan.data.selectedCategory) == -1 && jbCatMan.data.selectedCategory != "") cats.push(jbCatMan.data.selectedCategory);
  cats.push(jbCatManWizard.timestamp);
  return jbCatMan.getStringFromCategories(cats);
}

/* returns data[p] except for the Categories field, where the currently selected category gets added */
jbCatManWizard.getFieldValue4Import = function(data, p, importMap) {
  let prop = importMap[p];
  if (p == -1) {
    //an index of -1 means, there is no Categories data, and we have to genereate it on the fly
    return jbCatManWizard.addSelectedCategoryToCategories("");
  } else {
    //data is present, but we still have to manipulate the Categories field
    if (prop == jbCatMan.getCategoryField()) return jbCatManWizard.addSelectedCategoryToCategories(data[p]);
    return data[p];
  }
}



/* TreeView based on Example: https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/Tutorial/Tree_View_Details */
jbCatManWizard.importControlView = {

  treeBox: null,
  selection: null,
  data: null,
  columns: null,
  map: null,

  init: function(id, importData, importMap) {
    const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

    this.columns = importData[0].slice();
    this.data = importData.slice();
    this.map = importMap;
    
    //remove header from data
    this.data.shift();

    //clear any present columns
    {
      let cols = document.getElementById(id).children[0];
      while (cols.firstChild) {
        cols.removeChild(cols.firstChild);
      }
    }
    
    //build column header - but use renamed and/or mapped labels
    for (let col=-1; col<this.columns.length; col++) {

      //the negative index is used to identify "fake" fields, where the original data should not be used or is not pressent,
      //which is managed by getFieldValue4Import()
      //an index of -1 represents a fake Categories field

      if (!this.map[col]) continue;

      //check, if any contact has a value in that field - if there is none, do not add the col to the view
      let isEmpty = true;
      for (let idx = 0;  idx<this.data.length && isEmpty; idx++) {
        isEmpty = (jbCatManWizard.getFieldValue4Import(this.data[idx], col, this.map) == "");
      }
      if (isEmpty) continue;
      
      let newListEntry = document.createElementNS(XUL_NS, "treecol");
      newListEntry.setAttribute("id", "CatManimportControlViewCol_" + col); 
      newListEntry.setAttribute("label", this.map[col]);
      newListEntry.setAttribute("width", "160");
      newListEntry.setAttribute("style", "font-weight:bold");
      document.getElementById(id).children[0].appendChild(newListEntry);
    }
    document.getElementById(id).view = jbCatManWizard.importControlView;
  },
  
  get rowCount()                       { return this.data.length; },
  setTree: function(treeBox)           { this.treeBox = treeBox; },
  getCellText: function(idx, column)   { return jbCatManWizard.getFieldValue4Import(this.data[idx], column.id.replace("CatManimportControlViewCol_",""), this.map); },
  isContainer: function(idx)           { return false; },
  isContainerOpen: function(idx)       { return false; },
  isContainerEmpty: function(idx)      { return false; },
  isSeparator: function(idx)           { return false; },
  isSorted: function()                 { return false; },
  isEditable: function(idx, column)    { return false; },
  getParentIndex: function(idx)        { return false; },
  getLevel: function(idx)              { return false; },
  hasNextSibling: function(idx, after) { return false; },
  toggleOpenState: function(idx)       { return false; },

  getImageSrc: function(idx, column) {},
  getProgressMode : function(idx ,column) {},
  getCellValue: function(idx, column) {},
  cycleHeader: function(col, elem) {},
  selectionChanged: function() {},
  cycleCell: function(idx, column) {},
  performAction: function(action) {},
  performActionOnCell: function(action, index, column) {},
  getRowProperties: function(idx, prop) {},
  getCellProperties: function(idx, column, prop) {},
  getColumnProperties: function(column, element, prop) {},
};
