(function(){
    "use strict";
    const input=document.getElementById("excelFileInput");
    const fileName=document.getElementById("excelFileName");
    const selected=document.getElementById("excelSelectedFile");
    const dropzone=document.getElementById("excelDropzone");
    const form=document.getElementById("excelUploadForm");
    const submit=document.getElementById("excelSubmitButton");
    if(!input||!fileName||!selected)return;
    function updateFile(file){
        if(file){fileName.textContent=file.name;selected.classList.add("has-file");}
        else{fileName.textContent="No file selected";selected.classList.remove("has-file");}
    }
    input.addEventListener("change",()=>updateFile(input.files&&input.files[0]));
    if(dropzone){
        ["dragenter","dragover"].forEach(type=>dropzone.addEventListener(type,event=>{event.preventDefault();dropzone.classList.add("dragover");}));
        ["dragleave","drop"].forEach(type=>dropzone.addEventListener(type,event=>{event.preventDefault();dropzone.classList.remove("dragover");}));
        dropzone.addEventListener("drop",event=>{
            const file=event.dataTransfer&&event.dataTransfer.files&&event.dataTransfer.files[0];
            if(!file)return;
            if(!file.name.toLowerCase().endsWith(".xlsx")){window.alert("Please select an .xlsx Excel workbook.");return;}
            const dt=new DataTransfer();dt.items.add(file);input.files=dt.files;updateFile(file);
        });
    }
    if(form)form.addEventListener("submit",()=>{if(submit){submit.disabled=true;submit.textContent="VALIDATING & IMPORTING...";}});
})();
