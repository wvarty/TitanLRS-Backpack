document.addEventListener("DOMContentLoaded", init, false);

function _(el) {
    return document.getElementById(el);
}

function init() {
    initAat();
    initMavLink();
    initCRSFParams();

    // sends XMLHttpRequest, so do it last
    initOptions();
}

function initAat() {
    let aatsubmit = _('aatsubmit');
    if (!aatsubmit)
        return;

    aatsubmit.addEventListener('click', callback('Update AAT Parameters', 'An error occurred changing values', '/aatconfig',
        () => { return new URLSearchParams(new FormData(_('aatconfig'))); }
    ));
    _('azim_center').addEventListener('change', aatAzimCenterChanged);
    document.querySelectorAll('.aatlive').forEach(
        el => el.addEventListener('change', aatLineElementChanged)
    );
}

function initMavLink() {
    // Fetch initial MavLink configuration
    const xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
            const data = JSON.parse(this.responseText);
            updateMavLinkConfig(data);
            
            // Start periodic updates of MavLink stats
            updateMavLinkStats();
            setInterval(updateMavLinkStats, 1000);

            const resetButton = _('mavlink_reset_defaults');
            if (resetButton) {
                resetButton.addEventListener('click', resetMavLinkDefaults);
            }
        }
    };
    xmlhttp.open('GET', '/mavlink', true);
    xmlhttp.send();
}
function initOptions() {
    const xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
        const data = JSON.parse(this.responseText);
        updateConfig(data);
        setTimeout(get_networks, 2000);
      }
    };
    xmlhttp.open('GET', '/config', true);
    xmlhttp.send();
}

function updateMavLinkConfig(data) {
    _('mavlink_listen_port').value = data.ports.listen;
    _('mavlink_send_port').value = data.ports.send;
}

function updateMavLinkStats() {
    const xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
            const data = JSON.parse(this.responseText);
            
            // Update Stats
            _('mavlink_gcs_ip').textContent = data.ip.gcs;
            _('mavlink_packets_down').textContent = data.counters.packets_down;
            _('mavlink_packets_up').textContent = data.counters.packets_up;
            _('mavlink_drops_down').textContent = data.counters.drops_down;
            _('mavlink_overflows_down').textContent = data.counters.overflows_down;
        }
    };
    xmlhttp.open('GET', '/mavlink', true);
    xmlhttp.send();
}

function resetMavLinkDefaults() {
    const defaultSendPort = 14550;
    const defaultListenPort = 14555;

    // Update the input fields
    _('mavlink_listen_port').value = defaultListenPort;
    _('mavlink_send_port').value = defaultSendPort;

    // Send the new values to the server
    const xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function() {
        if (this.readyState == 4) {
            if (this.status == 200) {
                cuteAlert({
                    type: "success",
                    title: "Default Settings Applied",
                    message: "MavLink ports have been reset to default values."
                });
                // Refresh the MavLink stats to reflect the changes
                updateMavLinkStats();
            } else {
                cuteAlert({
                    type: "error",
                    title: "Error",
                    message: "Failed to apply default settings. Please try again."
                });
            }
        }
    };
    xmlhttp.open('POST', '/setmavlink', true);
    xmlhttp.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
    xmlhttp.send(`listen=${defaultListenPort}&send=${defaultSendPort}`);
}

function updateConfig(data) {
    let config = data.config;
    if (config.mode==="STA") {
        _('stamode').style.display = 'block';
        if (!config['aat']) {
            if (_('rtctab')) _('rtctab').style.display = 'table-cell';
        }
        if (config['head-tracking']) {
            if (_('httab')) _('httab').style.display = 'table-cell';
        }
        _('ssid').textContent = config.ssid;
    } else {
        _('apmode').style.display = 'block';
        if (config.ssid) {
            _('homenet').textContent = config.ssid;
        } else {
            _('connect').style.display = 'none';
        }
    }
    if((!data.stm32 || data.stm32==="no") && _('tx_tab')) {
        mui.tabs.activate('pane-justified-5');
        _('tx_tab').style.display = 'none';
    }
    if(config['product_name'] && _('product_name')) _('product_name').textContent = config['product_name'];

    // Update AP SSID field with current value
    if (config['ap_ssid']) {
        _('ap_ssid').value = config['ap_ssid'];
    }

    updateAatConfig(config);
}

function updateAatConfig(config)
{
    if (!config.hasOwnProperty('aat'))
        return;
    _('aattab').style.display = 'table-cell';

    // AAT
    _('servosmoo').value = config.aat.servosmoo;
    _('servomode').value = config.aat.servomode;
    _('azim_center').value = config.aat.azim_center;
    _('azim_min').value = config.aat.azim_min;
    _('azim_max').value = config.aat.azim_max;
    _('azim_sff').checked = config.aat.azim_sff === 1;
    _('elev_min').value = config.aat.elev_min;
    _('elev_max').value = config.aat.elev_max;
    _('satmin').value = config.aat.satmin;
    aatAzimCenterChanged();

    // VBAT
    _('vbat_offset').value = config.vbat.offset;
    _('vbat_scale').value = config.vbat.scale;
}

function get_networks() {
    var json_url = 'networks.json';
    xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function () {
        if (this.readyState == 4 && this.status == 200) {
            var data = JSON.parse(this.responseText);
            _('loader').style.display = 'none';
            autocomplete(_('network'), data);
        }
    };
    xmlhttp.open("POST", json_url, true);
    xmlhttp.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    xmlhttp.send();
}

function hasErrorParameter() {
    var tmp = [], result = false;
    location.search
        .substr(1)
        .split("&")
        .forEach(function (item) {
            tmp = item.split("=");
            if (tmp[0] === "error") result = true;
        });
    return result;
}

function show(elements, specifiedDisplay) {
    elements = elements.length ? elements : [elements];
    for (var index = 0; index < elements.length; index++) {
        elements[index].style.display = specifiedDisplay || 'block';
    }
}

var elements = document.querySelectorAll('#failed');
if (hasErrorParameter()) show(elements);

function autocomplete(inp, arr) {
    /*the autocomplete function takes two arguments,
    the text field element and an array of possible autocompleted values:*/
    var currentFocus;

    /*execute a function when someone writes in the text field:*/
    function handler(e) {
        var a, b, i, val = this.value;
        /*close any already open lists of autocompleted values*/
        closeAllLists();
        currentFocus = -1;
        /*create a DIV element that will contain the items (values):*/
        a = document.createElement("DIV");
        a.setAttribute("id", this.id + "autocomplete-list");
        a.setAttribute("class", "autocomplete-items");
        /*append the DIV element as a child of the autocomplete container:*/
        this.parentNode.appendChild(a);
        /*for each item in the array...*/
        for (i = 0; i < arr.length; i++) {
            /*check if the item starts with the same letters as the text field value:*/
            if (arr[i].substr(0, val.length).toUpperCase() == val.toUpperCase()) {
                /*create a DIV element for each matching element:*/
                b = document.createElement("DIV");
                /*make the matching letters bold:*/
                b.innerHTML = "<strong>" + arr[i].substr(0, val.length) + "</strong>";
                b.innerHTML += arr[i].substr(val.length);
                /*insert a input field that will hold the current array item's value:*/
                b.innerHTML += "<input type='hidden' value='" + arr[i] + "'>";
                /*execute a function when someone clicks on the item value (DIV element):*/
                b.addEventListener("click", ((arg) => (e) => {
                    /*insert the value for the autocomplete text field:*/
                    inp.value = arg.getElementsByTagName("input")[0].value;
                    /*close the list of autocompleted values,
                    (or any other open lists of autocompleted values:*/
                    closeAllLists();
                })(b));
                a.appendChild(b);
            }
        }
    }
    inp.addEventListener("input", handler);
    inp.addEventListener("click", handler);

    /*execute a function presses a key on the keyboard:*/
    inp.addEventListener("keydown", (e) => {
        var x = _(this.id + "autocomplete-list");
        if (x) x = x.getElementsByTagName("div");
        if (e.keyCode == 40) {
            /*If the arrow DOWN key is pressed,
            increase the currentFocus variable:*/
            currentFocus++;
            /*and and make the current item more visible:*/
            addActive(x);
        } else if (e.keyCode == 38) { //up
            /*If the arrow UP key is pressed,
            decrease the currentFocus variable:*/
            currentFocus--;
            /*and and make the current item more visible:*/
            addActive(x);
        } else if (e.keyCode == 13) {
            /*If the ENTER key is pressed, prevent the form from being submitted,*/
            e.preventDefault();
            if (currentFocus > -1) {
                /*and simulate a click on the "active" item:*/
                if (x) x[currentFocus].click();
            }
        }
    });
    function addActive(x) {
        /*a function to classify an item as "active":*/
        if (!x) return false;
        /*start by removing the "active" class on all items:*/
        removeActive(x);
        if (currentFocus >= x.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (x.length - 1);
        /*add class "autocomplete-active":*/
        x[currentFocus].classList.add("autocomplete-active");
    }
    function removeActive(x) {
        /*a function to remove the "active" class from all autocomplete items:*/
        for (var i = 0; i < x.length; i++) {
            x[i].classList.remove("autocomplete-active");
        }
    }
    function closeAllLists(elmnt) {
        /*close all autocomplete lists in the document,
        except the one passed as an argument:*/
        var x = document.getElementsByClassName("autocomplete-items");
        for (var i = 0; i < x.length; i++) {
            if (elmnt != x[i] && elmnt != inp) {
                x[i].parentNode.removeChild(x[i]);
            }
        }
    }
    /*execute a function when someone clicks in the document:*/
    document.addEventListener("click", (e) => {
        closeAllLists(e.target);
    });
}

//=========================================================

function uploadFile(type_suffix) {
    var file = _("firmware_file_" + type_suffix).files[0];
    var formdata = new FormData();
    formdata.append("type", type_suffix);
    formdata.append("upload", file, file.name);
    var ajax = new XMLHttpRequest();
    ajax.upload.addEventListener("progress", progressHandler(type_suffix), false);
    ajax.addEventListener("load", completeHandler(type_suffix), false);
    ajax.addEventListener("error", errorHandler(type_suffix), false);
    ajax.addEventListener("abort", abortHandler(type_suffix), false);
    ajax.open("POST", "/update");
    ajax.send(formdata);
}

function progressHandler(type_suffix) {
    return function (event) {
        //_("loaded_n_total").innerHTML = "Uploaded " + event.loaded + " bytes of " + event.total;
        var percent = Math.round((event.loaded / event.total) * 100);
        _("progressBar_" + type_suffix).value = percent;
        _("status_" + type_suffix).innerHTML = percent + "% uploaded... please wait";
    }
}

function completeHandler(type_suffix) {
    return function(event) {
        _("status_" + type_suffix).innerHTML = "";
        _("progressBar_" + type_suffix).value = 0;
        var data = JSON.parse(event.target.responseText);
        if (data.status === 'ok') {
            function show_message() {
                cuteAlert({
                    type: 'success',
                    title: "Update Succeeded",
                    message: data.msg
                });
            }
            // This is basically a delayed display of the success dialog with a fake progress
            var percent = 0;
            var interval = setInterval(()=>{
                percent = percent + 1;
                _("progressBar_" + type_suffix).value = percent;
                _("status_" + type_suffix).innerHTML = percent + "% flashed... please wait";
                if (percent == 100) {
                    clearInterval(interval);
                    _("status_" + type_suffix).innerHTML = "";
                    _("progressBar_" + type_suffix).value = 0;
                    show_message();
                }
            }, 100);
        } else if (data.status === 'mismatch') {
            cuteAlert({
                type: 'question',
                title: "Targets Mismatch",
                message: data.msg,
                confirmText: "Flash anyway",
                cancelText: "Cancel"
            }).then((e)=>{
                xmlhttp = new XMLHttpRequest();
                xmlhttp.onreadystatechange = function () {
                    if (this.readyState == 4) {
                        _("status_" + type_suffix).innerHTML = "";
                        _("progressBar_" + type_suffix).value = 0;
                        if (this.status == 200) {
                            var data = JSON.parse(this.responseText);
                            cuteAlert({
                                type: "info",
                                title: "Force Update",
                                message: data.msg
                            });
                        }
                        else {
                            cuteAlert({
                                type: "error",
                                title: "Force Update",
                                message: "An error occurred trying to force the update"
                            });
                        }
                    }
                };
                xmlhttp.open("POST", "/forceupdate", true);
                var data = new FormData();
                data.append("action", e);
                xmlhttp.send(data);
            });
        } else {
            cuteAlert({
                type: 'error',
                title: "Update Failed",
                message: data.msg
            });
        }
    }
}

function errorHandler(type_suffix) {
    return function(event) {
        _("status_" + type_suffix).innerHTML = "";
        _("progressBar_" + type_suffix).value = 0;
        cuteAlert({
            type: "error",
            title: "Update Failed",
            message: event.target.responseText
        });
    }
}

function abortHandler(type_suffix) {
    return function(event) {
        _("status_" + type_suffix).innerHTML = "";
        _("progressBar_" + type_suffix).value = 0;
        cuteAlert({
            type: "info",
            title: "Update Aborted",
            message: event.target.responseText
        });
    }
}

if (_('upload_form_tx')) {
    _('upload_form_tx').addEventListener('submit', (e) => {
        e.preventDefault();
        uploadFile("tx");
    });
}

if(_('upload_form_bp')) {
    _('upload_form_bp').addEventListener('submit', (e) => {
        e.preventDefault();
        uploadFile("bp");
    });
}

//=========================================================

function callback(title, msg, url, getdata) {
    return function(e) {
        e.stopPropagation();
        e.preventDefault();
        xmlhttp = new XMLHttpRequest();
        xmlhttp.onreadystatechange = function () {
            if (this.readyState == 4) {
                if (this.status == 200) {
                    cuteAlert({
                        type: "info",
                        title: title,
                        message: this.responseText
                    });
                }
                else {
                    cuteAlert({
                        type: "error",
                        title: title,
                        message: msg
                    });
                }
            }
        };
        xmlhttp.open("POST", url, true);
        if (getdata) data = getdata();
        else data = null;
        xmlhttp.send(data);
    }
}

function aatAzimCenterChanged()
{
    // Update the slider labels to represent the new orientation
    let labels;
    switch (parseInt(_('azim_center').selectedIndex))
    {
        default: /* fallthrough */
        case 0: labels = 'SWNES'; break; // N
        case 1: labels = 'WNESW'; break; // E
        case 2: labels = 'NESWN'; break; // S
        case 3: labels = 'ESWNE'; break; // W
    }
    let markers = _('bear_markers');
    for (i=0; i<markers.options.length; ++i)
        markers.options[i].label = labels[i];
}

function aatLineElementChanged()
{
    fetch("/aatconfig", {
        method: "POST",
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            'bear': _('bear').value,
            'elev': _('elev').value,
            'azim_sff': _('azim_sff').checked ? 1 : 0,
        })
    });
  }

_('sethome').addEventListener('submit', callback("Set Home Network", "An error occurred setting the home network", "/sethome", function() {
    return new FormData(_('sethome'));
}));
_('setapssid').addEventListener('submit', callback("WiFi AP SSID Updated", "An error occurred updating the AP SSID", "/setapssid", function() {
    return new FormData(_('setapssid'));
}));
_('ap_ssid_reset').addEventListener('click', function() {
    // Reset to default by clearing the custom SSID
    const xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function() {
        if (this.readyState == 4) {
            if (this.status == 200) {
                cuteAlert({
                    type: "info",
                    title: "Reset to Default",
                    message: "AP SSID has been reset to default. Changes will take effect on next AP mode activation."
                });
                // Fetch updated config and refresh the SSID field
                const configHttp = new XMLHttpRequest();
                configHttp.onreadystatechange = function() {
                    if (this.readyState == 4 && this.status == 200) {
                        const data = JSON.parse(this.responseText);
                        if (data.config && data.config.ap_ssid) {
                            _('ap_ssid').value = data.config.ap_ssid;
                        }
                    }
                };
                configHttp.open('GET', '/config', true);
                configHttp.send();
            } else {
                cuteAlert({
                    type: "error",
                    title: "Reset to Default",
                    message: "An error occurred resetting the AP SSID"
                });
            }
        }
    };
    xmlhttp.open('POST', '/setapssid', true);
    const formData = new FormData();
    formData.append('ap_ssid', '___DEFAULT___');
    xmlhttp.send(formData);
});
_('connect').addEventListener('click', callback("Connect to Home Network", "An error occurred connecting to the Home network", "/connect", null));
_('access').addEventListener('click', callback("Access Point", "An error occurred starting the Access Point", "/access", null));
_('forget').addEventListener('click', callback("Forget Home Network", "An error occurred forgetting the home network", "/forget", null));
if (_('setrtc')) _('setrtc').addEventListener('submit', callback("Set RTC Time", "An error occurred setting the RTC time", "/setrtc", function() {
    return new FormData(_('setrtc'));
}));

//=========================================================

// Alert box design by Igor Ferrão de Souza: https://www.linkedin.com/in/igor-ferr%C3%A3o-de-souza-4122407b/

function cuteAlert({
    type,
    title,
    message,
    buttonText = "OK",
    confirmText = "OK",
    cancelText = "Cancel",
    closeStyle,
  }) {
    return new Promise((resolve) => {
      setInterval(() => {}, 5000);
      const body = document.querySelector("body");

      const scripts = document.getElementsByTagName("script");

      let closeStyleTemplate = "alert-close";
      if (closeStyle === "circle") {
        closeStyleTemplate = "alert-close-circle";
      }

      let btnTemplate = `<div><button class="alert-button mui-btn mui-btn--primary">${buttonText}</button></div>`;
      if (type === "question") {
        btnTemplate = `
<div class="question-buttons">
  <button class="confirm-button mui-btn mui-btn--danger">${confirmText}</button>
  <button class="cancel-button mui-btn">${cancelText}</button>
</div>
`;
      }

      let svgTemplate = `
<svg class="alert-img" xmlns="http://www.w3.org/2000/svg" fill="#fff" viewBox="0 0 52 52" xmlns:v="https://vecta.io/nano">
<path d="M26 0C11.664 0 0 11.663 0 26s11.664 26 26 26 26-11.663 26-26S40.336 0 26 0zm0 50C12.767 50 2 39.233 2 26S12.767 2 26 2s24 10.767 24 24-10.767 24-24
24zm9.707-33.707a1 1 0 0 0-1.414 0L26 24.586l-8.293-8.293a1 1 0 0 0-1.414 1.414L24.586 26l-8.293 8.293a1 1 0 0 0 0 1.414c.195.195.451.293.707.293s.512-.098.707
-.293L26 27.414l8.293 8.293c.195.195.451.293.707.293s.512-.098.707-.293a1 1 0 0 0 0-1.414L27.414 26l8.293-8.293a1 1 0 0 0 0-1.414z"/>
</svg>
`;
      if (type === "success") {
        svgTemplate = `
<svg class="alert-img" xmlns="http://www.w3.org/2000/svg" fill="#fff" viewBox="0 0 52 52" xmlns:v="https://vecta.io/nano">
<path d="M26 0C11.664 0 0 11.663 0 26s11.664 26 26 26 26-11.663 26-26S40.336 0 26 0zm0 50C12.767 50 2 39.233 2 26S12.767 2 26 2s24 10.767 24 24-10.767 24-24
24zm12.252-34.664l-15.369 17.29-9.259-7.407a1 1 0 0 0-1.249 1.562l10 8a1 1 0 0 0 1.373-.117l16-18a1 1 0 1 0-1.496-1.328z"/>
</svg>
`;
      }
      if (type === "info") {
        svgTemplate = `
<svg class="alert-img" xmlns="http://www.w3.org/2000/svg" fill="#fff" viewBox="0 0 64 64" xmlns:v="https://vecta.io/nano">
<path d="M38.535 47.606h-4.08V28.447a1 1 0 0 0-1-1h-4.52a1 1 0 1 0 0 2h3.52v18.159h-5.122a1 1 0 1 0 0 2h11.202a1 1 0 1 0 0-2z"/>
<circle cx="32" cy="18" r="3"/><path d="M32 0C14.327 0 0 14.327 0 32s14.327 32 32 32 32-14.327 32-32S49.673 0 32 0zm0 62C15.458 62 2 48.542 2 32S15.458 2 32 2s30 13.458 30 30-13.458 30-30 30z"/>
</svg>
`;
      }

      const template = `
<div class="alert-wrapper">
  <div class="alert-frame">
    <div class="alert-header ${type}-bg">
      <span class="${closeStyleTemplate}">X</span>
      ${svgTemplate}
    </div>
    <div class="alert-body">
      <span class="alert-title">${title}</span>
      <span class="alert-message">${message}</span>
      ${btnTemplate}
    </div>
  </div>
</div>
`;

      body.insertAdjacentHTML("afterend", template);

      const alertWrapper = document.querySelector(".alert-wrapper");
      const alertFrame = document.querySelector(".alert-frame");
      const alertClose = document.querySelector(`.${closeStyleTemplate}`);

      function resolveIt() {
        alertWrapper.remove();
        resolve();
      }
      function confirmIt() {
        alertWrapper.remove();
        resolve("confirm");
      }
      function stopProp(e) {
        e.stopPropagation();
      }

      if (type === "question") {
        const confirmButton = document.querySelector(".confirm-button");
        const cancelButton = document.querySelector(".cancel-button");

        confirmButton.addEventListener("click", confirmIt);
        cancelButton.addEventListener("click", resolveIt);
      } else {
        const alertButton = document.querySelector(".alert-button");

        alertButton.addEventListener("click", resolveIt);
      }

      alertClose.addEventListener("click", resolveIt);
      alertWrapper.addEventListener("click", resolveIt);
      alertFrame.addEventListener("click", stopProp);
    });
  }

//=========================================================

if (_('httab')) _('httab').addEventListener('mui.tabs.showstart', start);

var websock;
var Euler = {heading: 0.0, pitch: 0.0, roll: 0.0};

const loadScript = (FILE_URL, async = true, type = "text/javascript") => {
    return new Promise((resolve, reject) => {
        try {
            const scriptEle = document.createElement("script");
            scriptEle.type = type;
            scriptEle.async = async;
            scriptEle.src = FILE_URL;

            scriptEle.addEventListener("load", (ev) => {
                resolve({ status: true });
            });

            scriptEle.addEventListener("error", (ev) => {
                reject({
                    status: false,
                    message: `Failed to load the script ${FILE_URL}`
                });
            });

            document.body.appendChild(scriptEle);
        } catch (error) {
            reject(error);
        }
    });
};

let ht_loaded = false;
function start() {
    if (!ht_loaded) {
        loadScript('p5.js').then(()=>{
            ht_loaded = true;
            websock = new WebSocket('ws://' + window.location.hostname + '/ws');
            // websock.onopen = function(evt) {
            //     console.log('websock open');
            //     var e = document.getElementById('webSockStatus');
            //     e.style.backgroundColor = 'green';
            // };
            // websock.onclose = function(evt) {
            //     console.log('websock close');
            //     var e = document.getElementById('webSockStatus');
            //     e.style.backgroundColor = 'red';
            // };
            websock.onerror = function(evt) { console.log(evt); };
            websock.onmessage = async function(evt) {
                d = JSON.parse(evt.data);
                if (d['done']) {
                    calibrationOff();
                    await cuteAlert({
                        type: 'info',
                        title: "Calibration",
                        message: "Calibration successful",
                        confirmText: "OK",
                    });
                }
                if (d['orientation']) {
                    _('x-angle').value = d.pitch;
                    _('y-angle').value = d.roll;
                    _('z-angle').value = d.heading;
                    _('label-x').textContent = d.pitch;
                    _('label-y').textContent = d.roll;
                    _('label-z').textContent = d.heading;
                    if (!d.hasIMU) {
                        show(document.querySelectorAll('.hasIMU'), 'none');
                    }
                }
                if (d['heading']) {
                    Euler = d;
                    _('angle-x').textContent = Euler.roll;
                    _('angle-y').textContent = Euler.pitch;
                    _('angle-z').textContent = Euler.heading;
                }
            };
        })
    }
}

let plane;
let tex;

function preload() {
    plane = loadModel('airplane.obj', true);
    tex = loadImage('texture.gif');
}

function setup() {
    var canvas = createCanvas(500, 500, WEBGL);
    canvas.parent('canvas-holder');
}

function draw() {
    background(192);

    rotateY(radians(Euler.heading + 180)); // Add 180 degrees so the plane is facing away at zero
    rotateZ(radians(Euler.pitch));
    rotateX(radians(-Euler.roll)); // Invert the about the pitch axis (i.e. roll is opposite)

    push();
    stroke('#CCC');
    strokeWeight(0.5);
    for (let x=-width/2; x <= width/2; x +=20) {
        line(x, 0, -height/2, x, 0, height/2);
    }
    for (let z=-height/2; z <= height/2; z +=20) {
        line(-width/2, 0, z, width/2, 0, z);
    }
    pop();

    push();
    noStroke();
    scale(2);
    translate(0,-26,0);
    texture(tex);
    model(plane);
    pop();
}

if (_('set-center')) _('set-center').addEventListener('click', () => {websock.send('sc');});
if (_('cal-gyro')) _('cal-gyro').addEventListener('click', calibrateIMU);
if (_('reset-board')) _('reset-board').addEventListener('click', (e) => {
    _('x-angle').value = 0;
    _('y-angle').value = 0;
    _('z-angle').value = 0;
    setOrientation(e);
    websock.send('ro');
});
if (_('save-orientation')) _('save-orientation').addEventListener('click', saveOrientation);
if (_('x-angle')) _('x-angle').addEventListener('input', setOrientation);
if (_('y-angle')) _('y-angle').addEventListener('input', setOrientation);
if (_('z-angle')) _('z-angle').addEventListener('input', setOrientation);

async function calibrateIMU() {
    await cuteAlert({
        type: 'info',
        title: "Calibrate IMU",
        message: "Place the board flat on the table and wait until the succeeded popup appears",
        confirmText: "Calibrate",
        cancelText: "Cancel"
    }).then((e)=>{
        websock.send('ci');
        calibrationOn();
    });
}

function setOrientation(e) {
    _('label-x').textContent = _('x-angle').value;
    _('label-y').textContent = _('y-angle').value;
    _('label-z').textContent = _('z-angle').value;
    websock.send('o:' + _('x-angle').value + ':' + _('y-angle').value + ':' + _('z-angle').value);
}

function saveOrientation() {
    websock.send('sv');
    cuteAlert({
        type: 'info',
        title: "Save Board Orientation",
        message: "Board orientation has been saved to configuration",
        confirmText: "OK"
    });
}

function calibrationOn() {
    _('main').classList.add('loading');
    let calibrating = document.createElement('div')
    calibrating.innerHTML = '<div class="ring">Calibrating<span></span></div>'
    mui.overlay('on', {
        'keyboard': false,
        'static': true
    }, calibrating);
}

function calibrationOff() {
    _('main').classList.remove('loading');
    mui.overlay('off');
}

//=========================================================
// CRSF Parameters
//=========================================================

// CRSF Protocol Constants
const CRSF_FRAMETYPE_DEVICE_PING = 0x28;
const CRSF_FRAMETYPE_DEVICE_INFO = 0x29;
const CRSF_FRAMETYPE_PARAM_ENTRY = 0x2B;
const CRSF_FRAMETYPE_PARAM_READ = 0x2C;
const CRSF_FRAMETYPE_PARAM_WRITE = 0x2D;

// Parameter Types
const PARAM_TYPE = {
    UINT8: 0x00,
    INT8: 0x01,
    UINT16: 0x02,
    INT16: 0x03,
    UINT32: 0x04,
    INT32: 0x05,
    FLOAT: 0x08,
    TEXT_SELECTION: 0x09,
    STRING: 0x0A,
    FOLDER: 0x0B,
    INFO: 0x0C,
    COMMAND: 0x0D
};

const PARAM_HIDDEN = 0x80;

// Global state
let crsfDevices = [];
let selectedDevice = null;
let crsfParameters = [];
let currentFolder = 0;
let currentParameterChunks = [];
let parameterQueue = [];
let isLoadingParameters = false;

// Initialize CRSF parameters on page load
function initCRSFParams() {
    if (!_('scan_devices')) return;

    _('scan_devices').addEventListener('click', scanForDevices);
    _('reload_params').addEventListener('click', reloadParameters);
    _('params_back').addEventListener('click', navigateBack);
}

// Scan for CRSF devices
function scanForDevices() {
    _('scan_devices').disabled = true;
    _('scan_devices').textContent = 'Scanning...';
    _('device_list').innerHTML = '<p style="color: #999; text-align: center;">Scanning for devices...</p>';

    // Send scan request to C++ backend
    // The backend should send DEVICE_PING frames and collect DEVICE_INFO responses
    const xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if (this.readyState == 4) {
            _('scan_devices').disabled = false;
            _('scan_devices').textContent = 'Scan for Devices';

            if (this.status == 200) {
                const devices = JSON.parse(this.responseText);
                handleDevicesDiscovered(devices);
            } else {
                _('device_list').innerHTML = '<p style="color: #f44336;">Error scanning for devices. Make sure TX module is connected.</p>';
            }
        }
    };
    xhr.open('GET', '/crsf/scan', true);
    xhr.send();
}

// Handle discovered devices
function handleDevicesDiscovered(devices) {
    crsfDevices = devices;

    if (devices.length === 0) {
        _('device_list').innerHTML = '<p style="color: #999; text-align: center;">No devices found</p>';
        return;
    }

    let html = '<div style="margin-top: 10px;">';
    devices.forEach((device, index) => {
        const statusClass = device.online ? 'success-bg' : '';
        const statusText = device.online ? 'Online' : 'Offline';

        html += `
            <div class="device-item" onclick="selectDevice(${index})" style="
                padding: 12px;
                margin-bottom: 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
                cursor: pointer;
                background: ${selectedDevice && selectedDevice.address === device.address ? '#e3f2fd' : '#fff'};
            ">
                <div style="font-weight: bold; margin-bottom: 4px;">${device.name}</div>
                <div style="font-size: 0.85em; color: #666;">
                    ID: 0x${device.address.toString(16).toUpperCase()}<br/>
                    S/N: ${device.serialNumber.toString(16).toUpperCase()}<br/>
                    Params: ${device.parametersTotal}
                </div>
                <div style="margin-top: 6px;">
                    <span style="
                        display: inline-block;
                        padding: 2px 8px;
                        font-size: 0.75em;
                        border-radius: 3px;
                        background: ${device.online ? '#4caf50' : '#999'};
                        color: white;
                    ">${statusText}</span>
                </div>
            </div>
        `;
    });
    html += '</div>';

    _('device_list').innerHTML = html;
}

// Select a device and load its parameters
function selectDevice(index) {
    selectedDevice = crsfDevices[index];
    currentFolder = 0;
    crsfParameters = [];

    // Update device list UI
    handleDevicesDiscovered(crsfDevices);

    // Update parameters panel
    _('params_device_name').textContent = selectedDevice.name;
    _('reload_params').disabled = false;
    _('params_breadcrumb').style.display = 'none';

    // Load all parameters
    loadAllParameters();
}

// Load all parameters for the selected device
function loadAllParameters() {
    if (!selectedDevice) return;

    _('params_content').innerHTML = '<p style="color: #999; text-align: center; margin-top: 50px;">Loading parameters...</p>';
    isLoadingParameters = true;

    const xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if (this.readyState == 4) {
            isLoadingParameters = false;

            if (this.status == 200) {
                try {
                    const params = JSON.parse(this.responseText);
                    crsfParameters = params;
                    renderCurrentFolder();
                } catch (e) {
                    console.error('Failed to parse parameters JSON:', e);
                    console.error('Response text:', this.responseText);
                    _('params_content').innerHTML = '<p style="color: #f44336;">Error: Invalid JSON response from server. Check console for details.</p>';
                }
            } else {
                _('params_content').innerHTML = '<p style="color: #f44336;">Error loading parameters (HTTP ' + this.status + ')</p>';
            }
        }
    };
    xhr.open('GET', `/crsf/params?device=${selectedDevice.address}`, true);
    xhr.send();
}

// Reload parameters
function reloadParameters() {
    loadAllParameters();
}

// Render parameters in current folder
function renderCurrentFolder() {
    const folderParams = crsfParameters.filter(p => p.parentFolder === currentFolder && !p.isHidden);

    // Update breadcrumb
    if (currentFolder === 0) {
        _('params_breadcrumb').style.display = 'none';
    } else {
        _('params_breadcrumb').style.display = 'block';
        const folderParam = crsfParameters.find(p => p.paramNumber === currentFolder);
        _('params_path').textContent = folderParam ? folderParam.name : 'Folder';
    }

    if (folderParams.length === 0) {
        _('params_content').innerHTML = '<p style="color: #999; text-align: center; margin-top: 50px;">No parameters in this folder</p>';
        return;
    }

    let html = '<table class="mui-table" style="width: 100%;">';

    folderParams.forEach(param => {
        html += `<tr><td style="width: 40%; font-weight: 500;">${param.name}</td><td>`;
        html += renderParameter(param);
        html += '</td></tr>';
    });

    html += '</table>';
    _('params_content').innerHTML = html;
}

// Render a single parameter based on its type
function renderParameter(param) {
    switch (param.type) {
        case PARAM_TYPE.UINT8:
        case PARAM_TYPE.INT8:
        case PARAM_TYPE.UINT16:
        case PARAM_TYPE.INT16:
        case PARAM_TYPE.UINT32:
        case PARAM_TYPE.INT32:
            return renderNumericParameter(param);

        case PARAM_TYPE.FLOAT:
            return renderFloatParameter(param);

        case PARAM_TYPE.TEXT_SELECTION:
            return renderTextSelectionParameter(param);

        case PARAM_TYPE.STRING:
            return renderStringParameter(param);

        case PARAM_TYPE.FOLDER:
            return renderFolderParameter(param);

        case PARAM_TYPE.COMMAND:
            return renderCommandParameter(param);

        case PARAM_TYPE.INFO:
            return renderInfoParameter(param);

        default:
            return `<span style="color: #999;">Unknown type</span>`;
    }
}

// Render numeric parameter
function renderNumericParameter(param) {
    const unit = param.unit ? ` <span style="color: #666; font-size: 0.9em;">${param.unit}</span>` : '';
    return `
        <div style="display: flex; align-items: center; gap: 10px;">
            <input type="number"
                value="${param.value}"
                min="${param.min}"
                max="${param.max}"
                onchange="updateParameter(${param.paramNumber}, parseInt(this.value))"
                style="flex: 1; padding: 6px; border: 1px solid #ddd; border-radius: 4px;">
            ${unit}
            <span style="color: #999; font-size: 0.85em;">[${param.min}-${param.max}]</span>
        </div>
    `;
}

// Render float parameter
function renderFloatParameter(param) {
    const step = param.stepSize || 0.1;
    const decimals = param.decimalPoint || 2;
    const unit = param.unit ? ` <span style="color: #666; font-size: 0.9em;">${param.unit}</span>` : '';
    return `
        <div style="display: flex; align-items: center; gap: 10px;">
            <input type="number"
                value="${param.value.toFixed(decimals)}"
                min="${param.min}"
                max="${param.max}"
                step="${step}"
                onchange="updateParameter(${param.paramNumber}, parseFloat(this.value))"
                style="flex: 1; padding: 6px; border: 1px solid #ddd; border-radius: 4px;">
            ${unit}
            <span style="color: #999; font-size: 0.85em;">[${param.min.toFixed(decimals)}-${param.max.toFixed(decimals)}]</span>
        </div>
    `;
}

// Render text selection parameter
function renderTextSelectionParameter(param) {
    const unit = param.unit ? ` <span style="color: #666; font-size: 0.9em;">${param.unit}</span>` : '';
    let html = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <select onchange="updateParameter(${param.paramNumber}, parseInt(this.value))"
                style="flex: 1; padding: 6px; border: 1px solid #ddd; border-radius: 4px;">
    `;

    param.options.forEach((option, index) => {
        const selected = index === param.value ? 'selected' : '';
        html += `<option value="${index}" ${selected}>${option}</option>`;
    });

    html += `</select>${unit}</div>`;
    return html;
}

// Render string parameter
function renderStringParameter(param) {
    return `
        <input type="text"
            value="${param.value}"
            maxlength="${param.maxLength}"
            onchange="updateParameter(${param.paramNumber}, this.value)"
            style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px;">
    `;
}

// Render folder parameter
function renderFolderParameter(param) {
    return `
        <button class="mui-btn mui-btn--small" onclick="enterFolder(${param.paramNumber})">
            Enter
        </button>
    `;
}

// Render command parameter
function renderCommandParameter(param) {
    return `
        <button class="mui-btn mui-btn--small mui-btn--primary" onclick="executeCommand(${param.paramNumber})">
            Execute
        </button>
    `;
}

// Render info parameter
function renderInfoParameter(param) {
    return `<span style="color: #666;">${param.value || 'N/A'}</span>`;
}

// Enter a folder
function enterFolder(paramNumber) {
    currentFolder = paramNumber;
    renderCurrentFolder();
}

// Navigate back to parent folder
function navigateBack() {
    if (currentFolder === 0) return;

    const currentFolderParam = crsfParameters.find(p => p.paramNumber === currentFolder);
    if (currentFolderParam) {
        currentFolder = currentFolderParam.parentFolder;
        renderCurrentFolder();
    }
}

// Update a parameter value
function updateParameter(paramNumber, value) {
    const param = crsfParameters.find(p => p.paramNumber === paramNumber);
    if (!param) return;

    // Update local value
    param.value = value;

    // Send update to backend
    const xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if (this.readyState == 4) {
            if (this.status == 200) {
                cuteAlert({
                    type: 'success',
                    title: 'Parameter Updated',
                    message: `${param.name} updated successfully`
                });
            } else {
                cuteAlert({
                    type: 'error',
                    title: 'Update Failed',
                    message: `Failed to update ${param.name}`
                });
            }
        }
    };

    xhr.open('POST', '/crsf/param/write', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify({
        device: selectedDevice.address,
        paramNumber: paramNumber,
        paramType: param.type,
        value: value
    }));
}

// Execute a command parameter
function executeCommand(paramNumber) {
    const param = crsfParameters.find(p => p.paramNumber === paramNumber);
    if (!param) return;

    cuteAlert({
        type: 'question',
        title: 'Execute Command',
        message: `Execute "${param.name}"?`,
        confirmText: 'Execute',
        cancelText: 'Cancel'
    }).then((result) => {
        if (result === 'confirm') {
            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = function() {
                if (this.readyState == 4) {
                    if (this.status == 200) {
                        cuteAlert({
                            type: 'success',
                            title: 'Command Executed',
                            message: `${param.name} executed successfully`
                        });
                    } else {
                        cuteAlert({
                            type: 'error',
                            title: 'Execution Failed',
                            message: `Failed to execute ${param.name}`
                        });
                    }
                }
            };

            xhr.open('POST', '/crsf/param/execute', true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(JSON.stringify({
                device: selectedDevice.address,
                paramNumber: paramNumber,
                paramType: param.type
            }));
        }
    });
}
