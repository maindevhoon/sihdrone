import { createContext, useContext } from 'react';

// Interface language. English text is the key and the fallback, so an untranslated string still
// renders correctly. Sensor HUD abbreviations (PPI, AZ/EL, NFOV…) stay in English, as on real displays.
export type Lang = 'en' | 'hi';
const hi: Record<string, string> = {
  // Top bar and navigation
  'Airspace observation trainer': 'हवाई क्षेत्र निगरानी प्रशिक्षक', 'Exercise': 'अभ्यास', 'Debrief': 'समीक्षा', 'Progress': 'प्रगति',
  'SCENARIO': 'परिदृश्य', 'EXERCISE CLOCK': 'अभ्यास घड़ी', 'TRAINEE': 'प्रशिक्षु',
  'STANDBY': 'तैयार', 'LIVE': 'सक्रिय', 'HOLD': 'रुका', 'DEBRIEF': 'समीक्षा',
  'Operator guide and shortcuts': 'ऑपरेटर गाइड और शॉर्टकट', 'Language': 'भाषा',
  // Mission setup
  'MISSION SETUP': 'मिशन सेटअप', 'GUIDED': 'मार्गदर्शित', 'CHALLENGE': 'चुनौती', 'THEATRE': 'क्षेत्र', 'EXERCISE': 'अभ्यास',
  'DIFFICULTY': 'कठिनाई', 'LIGHTING': 'प्रकाश', 'VARIATION': 'संस्करण', 'PROCEDURE': 'प्रक्रिया',
  'Guided': 'मार्गदर्शित', 'Challenge': 'चुनौती', 'Day': 'दिन', 'Dusk': 'संध्या', 'Shuffle': 'बदलें',
  'Area': 'क्षेत्र', 'Window': 'अवधि', 'Visibility': 'दृश्यता', 'Sensors': 'सेंसर', 'Training district': 'प्रशिक्षण ज़िला',
  'Light urban haze': 'हल्की शहरी धुंध', 'Dense urban haze': 'घनी शहरी धुंध',
  'Detect': 'पता लगाएँ', 'Observe': 'अवलोकन', 'Identify': 'पहचानें',
  'Scan the skyline and the radar for new returns.': 'नए संकेतों के लिए आकाश और रडार पर नज़र रखें।',
  'Click the aircraft or its radar track, or press': 'विमान या उसके रडार ट्रैक पर क्लिक करें, या दबाएँ',
  'Confirm on the EO/IR feed, then classify with': 'EO/IR फ़ीड पर पुष्टि करें, फिर वर्गीकृत करें',
  'Start exercise': 'अभ्यास शुरू करें', 'Hold exercise': 'अभ्यास रोकें', 'Resume exercise': 'अभ्यास जारी रखें', 'Run a new variation': 'नया संस्करण चलाएँ',
  'Synthetic encounters · results stay in this browser': 'कृत्रिम परिदृश्य · परिणाम इसी ब्राउज़र में रहते हैं',
  'Locally rendered city block; supports thermal view.': 'स्थानीय रूप से बना शहरी खंड; थर्मल दृश्य उपलब्ध।',
  'satellite imagery on 3D terrain': '3D भू-भाग पर उपग्रह चित्र',
  // Exercises
  'Skyline watch': 'आकाश निगरानी', 'Passing contact': 'गुज़रता संपर्क', 'Mixed recognition': 'मिश्रित पहचान',
  'Eyes on the horizon': 'क्षितिज पर नज़र', 'A passing silhouette': 'गुज़रती छाया', 'Expect the unexpected': 'अप्रत्याशित के लिए तैयार रहें',
  'Observe the Delhi skyline. Identify the aerial objects as they enter the district.': 'आकाश पर नज़र रखें। क्षेत्र में प्रवेश करती हवाई वस्तुओं की पहचान करें।',
  'A brief movement above the rooftops. Practice noticing and identifying a single aerial contact.': 'छतों के ऊपर एक क्षणिक हलचल। किसी एक हवाई संपर्क को देखने और पहचानने का अभ्यास करें।',
  'Each variation brings a different encounter. Observe first, then classify what you actually see.': 'हर संस्करण में अलग सामना होता है। पहले देखें, फिर वही वर्गीकृत करें जो वास्तव में दिखे।',
  // Situation panel
  'SITUATION': 'स्थिति', 'Radar · simulated': 'रडार · सिम्युलेटेड', 'OBSERVATION': 'अवलोकन', 'CLASSIFICATION': 'वर्गीकरण',
  'SCANNING': 'स्कैनिंग', 'AWAITING MARK': 'अंकन की प्रतीक्षा', 'NOT STARTED': 'शुरू नहीं हुआ', 'MARKED': 'अंकित',
  'Confirm the type on the EO/IR feed, then classify the contact.': 'EO/IR फ़ीड पर प्रकार की पुष्टि करें, फिर संपर्क को वर्गीकृत करें।',
  'The scene shows a sample moment. Start the exercise to practise detection.': 'दृश्य एक नमूना क्षण दिखाता है। पहचान का अभ्यास करने के लिए अभ्यास शुरू करें।',
  'Mark as soon as you see aerial movement. Timing counts from arrival.': 'हवाई हलचल दिखते ही अंकित करें। समय आगमन से गिना जाता है।',
  'Mark observation': 'अवलोकन अंकित करें', 'Observation recorded': 'अवलोकन दर्ज हुआ',
  'Single drone': 'एकल ड्रोन', 'Drone group': 'ड्रोन समूह', 'Bird': 'पक्षी',
  'End & debrief': 'समाप्त करें व समीक्षा', 'hold': 'रोकें', 'observe': 'अवलोकन', 'classify': 'वर्गीकरण',
  'Keep scanning. The aerial objects have not entered the district yet.': 'स्कैन करते रहें। हवाई वस्तुएँ अभी क्षेत्र में नहीं आई हैं।',
  // Recognition guide
  'RECOGNITION CUES': 'पहचान संकेत', 'Multirotor UAS': 'मल्टीरोटर UAS', 'Coordinated UAS': 'समन्वित UAS', 'Black kite': 'काली चील',
  'Rigid airframe; no wingbeat. Speed changes show as body tilt.': 'कठोर ढाँचा; पंख नहीं फड़फड़ाते। गति बदलने पर ढाँचा झुकता है।',
  'Smooth, deliberate legs; can slow, hover or reverse.': 'सधी, नियंत्रित उड़ान; धीमा हो सकता है, मँडरा सकता है या पीछे जा सकता है।',
  'Red/green navigation lights and a white strobe, most obvious at dusk.': 'लाल/हरी नेविगेशन लाइटें और सफ़ेद स्ट्रोब, संध्या में सबसे स्पष्ट।',
  'A steady rotor hum that rises in pitch as it manoeuvres.': 'रोटर की लगातार भनभनाहट, जो मोड़ लेते समय तेज़ होती है।',
  'IR: motors and battery are the hottest points.': 'IR: मोटर और बैटरी सबसे गर्म बिंदु होते हैं।',
  'Several rigid airframes with matching heading and speed.': 'एक जैसी दिशा और गति वाले कई कठोर ढाँचे।',
  'Spacing holds through turns; manoeuvres start together.': 'मोड़ों में भी आपसी दूरी बनी रहती है; सब एक साथ मुड़ते हैं।',
  'Multiple radar tracks moving as one formation.': 'एक संरचना में चलते कई रडार ट्रैक।',
  'Long angled wings with fingered tips; shallow forked tail.': 'लंबे कोणीय पंख, सिरों पर उँगली जैसे पर; हल्की दो-फाँकी पूँछ।',
  'Long glides on steady wings, with short bursts of slow flapping.': 'स्थिर पंखों पर लंबी सरकन, बीच-बीच में धीमी फड़फड़ाहट।',
  'Banks steeply into turns; tail twists to steer. No lights.': 'मोड़ों पर तेज़ी से झुकती है; दिशा के लिए पूँछ घुमाती है। कोई लाइट नहीं।',
  'No motor hum; a kite is effectively silent at these ranges.': 'मोटर की आवाज़ नहीं; इन दूरियों पर चील लगभग नि:शब्द रहती है।',
  'IR: the whole body is warm, without motor hot spots.': 'IR: पूरा शरीर गर्म, मोटर जैसे गर्म बिंदु नहीं।',
  'Size reference': 'आकार संदर्भ', 'Published figures': 'प्रकाशित आँकड़े',
  "Small UAS are roughly 0.3–1.4 m tip to tip; a kite spans about 1.5 m. Compare with the EO feed's SPAN estimate.": 'छोटे UAS सिरे से सिरे तक लगभग 0.3–1.4 मी. होते हैं; चील के पंख लगभग 1.5 मी. फैले होते हैं। EO फ़ीड के SPAN अनुमान से मिलाएँ।',
  // Operator guide
  'WELCOME TO AERON': 'AERON में आपका स्वागत है', 'OPERATOR GUIDE': 'ऑपरेटर गाइड',
  'Detect, observe, identify, debrief': 'पता लगाएँ, देखें, पहचानें, समीक्षा करें', 'Procedure and shortcuts': 'प्रक्रिया और शॉर्टकट',
  'Aeron trains low-altitude aerial observation. Each 45-second exercise brings drones, drone groups or black kites; your job is to notice them early and identify them correctly.': 'Aeron कम ऊँचाई की हवाई निगरानी का प्रशिक्षण देता है। हर 45 सेकंड के अभ्यास में ड्रोन, ड्रोन समूह या काली चीलें आती हैं; आपका काम उन्हें जल्दी देखना और सही पहचानना है।',
  'Watch the skyline and the radar. New returns appear as yellow unknown tracks.': 'आकाश और रडार पर नज़र रखें। नए संकेत पीले अज्ञात ट्रैक के रूप में दिखते हैं।',
  'Click the aircraft, click its radar track, or press O as soon as you see movement. Timing counts from arrival.': 'हलचल दिखते ही विमान या उसके रडार ट्रैक पर क्लिक करें, या O दबाएँ। समय आगमन से गिना जाता है।',
  'The EO/IR sensor slews to the track. Compare shape, motion, lights and heat, then classify with 1–3.': 'EO/IR सेंसर ट्रैक की ओर घूमता है। आकार, गति, लाइट और ऊष्मा की तुलना करें, फिर 1–3 से वर्गीकृत करें।',
  'Review the score, replay the encounter and follow your progress across sessions.': 'स्कोर देखें, सामना दोबारा चलाएँ और सत्रों में अपनी प्रगति देखें।',
  'KEYBOARD': 'कीबोर्ड', 'Start, hold or resume': 'शुरू करें, रोकें या जारी रखें', 'Mark observation (key)': 'अवलोकन अंकित करें',
  'Single drone · Drone group · Bird': 'एकल ड्रोन · ड्रोन समूह · पक्षी', 'Next radar track (slews EO/IR)': 'अगला रडार ट्रैक (EO/IR घुमाता है)',
  'Toggle EO / IR feed': 'EO / IR फ़ीड बदलें', 'Thermal sensor view': 'थर्मल सेंसर दृश्य', 'Fullscreen sensor view': 'पूर्ण-स्क्रीन सेंसर दृश्य',
  'Mute rotor audio': 'रोटर ध्वनि बंद करें', 'This help': 'यह सहायता',
  'Synthetic training data. Results stay in this browser.': 'कृत्रिम प्रशिक्षण डेटा। परिणाम इसी ब्राउज़र में रहते हैं।',
  'Begin training': 'प्रशिक्षण शुरू करें', 'Close': 'बंद करें',
  // Debrief
  'AFTER-ACTION REVIEW': 'अभ्यास-पश्चात समीक्षा', 'Practice score': 'अभ्यास स्कोर', 'Time after arrival': 'आगमन के बाद समय',
  'Classification': 'वर्गीकरण', 'Scene contained': 'दृश्य में था', 'Correct': 'सही', 'Incorrect': 'गलत', 'Not submitted': 'जमा नहीं', 'Not recorded': 'दर्ज नहीं',
  'Observation timing': 'अवलोकन समय', 'Replay session': 'सत्र रीप्ले करें', 'Close replay': 'रीप्ले बंद करें', 'Repeat variation': 'संस्करण दोहराएँ',
  'Export result': 'परिणाम निर्यात करें', 'Print report': 'रिपोर्ट प्रिंट करें', 'Session timeline': 'सत्र समयरेखा', 'Next exercise': 'अगला अभ्यास',
  'Your practice history': 'आपका अभ्यास इतिहास', 'ENCOUNTER REFERENCE': 'सामना संदर्भ', 'Theatre': 'क्षेत्र',
  'Correctly classified.': 'सही वर्गीकृत।', 'An observation to practice.': 'अवलोकन का अभ्यास करें।', 'A closer look next time.': 'अगली बार ध्यान से देखें।', 'Complete the classification.': 'वर्गीकरण पूरा करें।',
  // Progress
  'TRAINEE PROGRESS': 'प्रशिक्षु प्रगति', 'Training record': 'प्रशिक्षण रिकॉर्ड', 'Sessions': 'सत्र', 'Mean score': 'औसत स्कोर', 'Identification': 'पहचान',
  'Time to observe': 'अवलोकन समय', 'Practice readiness': 'अभ्यास तत्परता', 'Score trend': 'स्कोर प्रवृत्ति', 'Milestones': 'लक्ष्य',
  'Identification matrix': 'पहचान मैट्रिक्स', 'By category': 'श्रेणी अनुसार', 'By theatre': 'क्षेत्र अनुसार', 'By conditions': 'परिस्थिति अनुसार',
  'Export CSV': 'CSV निर्यात', 'Print record': 'रिकॉर्ड प्रिंट करें', 'UNIT / ID': 'यूनिट / आईडी',
  'Not started': 'शुरू नहीं', 'In training': 'प्रशिक्षणाधीन', 'Proficient': 'दक्ष', 'Ready': 'तैयार',
  'No sessions yet': 'अभी कोई सत्र नहीं', 'Go to exercise': 'अभ्यास पर जाएँ',
};
export const translate = (lang: Lang, text: string) => lang === 'hi' ? hi[text] ?? text : text;
export const LangContext = createContext<Lang>('en');
/** Returns a translator for the current interface language. */
export function useT() { const lang = useContext(LangContext); return (text: string) => translate(lang, text); }
export function readLang(): Lang { try { return localStorage.getItem('aeron-lang') === 'hi' ? 'hi' : 'en'; } catch { return 'en'; } }
export function saveLang(lang: Lang) { try { localStorage.setItem('aeron-lang', lang); } catch { /* preference only */ } }
