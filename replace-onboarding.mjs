import fs from 'fs';
let content = fs.readFileSync('src/components/Onboarding.tsx', 'utf8');

const target = `                {['Foratura', 'Catena', 'Regolazione Cambio', 'Freni', 'Centratura Ruota'].map((skill) => (
                    <label key={skill} className="flex items-center gap-3 bg-black/5 p-3 rounded-xl cursor-pointer hover:bg-black/10 transition-colors">
                        <input 
                            type="checkbox" 
                            className="w-5 h-5 accent-[#14B8A6]"
                            checked={peerSkills.includes(skill)}
                            onChange={(e) => {
                                if (e.target.checked) setPeerSkills([...peerSkills, skill]);
                                else setPeerSkills(peerSkills.filter(s => s !== skill));
                            }}
                        />
                        <span className="text-black font-bold text-sm">{skill}</span>
                    </label>
                ))}`;

const rep = `                {['Foratura', 'Catena', 'Regolazione Cambio', 'Freni', 'Centratura Ruota', ...customSkills].map((skill) => (
                    <label key={skill} className="flex items-center gap-3 bg-black/5 p-3 rounded-xl cursor-pointer hover:bg-black/10 transition-colors">
                        <input 
                            type="checkbox" 
                            className="w-5 h-5 accent-[#14B8A6]"
                            checked={peerSkills.includes(skill)}
                            onChange={(e) => {
                                if (e.target.checked) setPeerSkills([...peerSkills, skill]);
                                else setPeerSkills(peerSkills.filter(s => s !== skill));
                            }}
                        />
                        <span className="text-black font-bold text-sm">{skill}</span>
                    </label>
                ))}
                <div className="flex gap-2 items-center mt-4 border-t border-black/5 pt-4">
                    <input 
                        type="text" 
                        placeholder="Altra abilità (es. Sostituzione raggi)"
                        className="flex-1 bg-black/5 p-3 rounded-xl text-black text-sm outline-none focus:ring-2 focus:ring-[#14B8A6] border border-transparent focus:border-[#14B8A6]/20 transition-all font-medium placeholder:text-black/30"
                        value={newSkillText}
                        onChange={(e) => setNewSkillText(e.target.value)}
                        onKeyDown={(e) => {
                            if(e.key === 'Enter') {
                                e.preventDefault();
                                const trimmed = newSkillText.trim();
                                const defaultSkills = ['Foratura', 'Catena', 'Regolazione Cambio', 'Freni', 'Centratura Ruota'];
                                if(trimmed && !defaultSkills.includes(trimmed) && !customSkills.includes(trimmed)) {
                                    setCustomSkills([...customSkills, trimmed]);
                                    setPeerSkills([...peerSkills, trimmed]);
                                    setNewSkillText('');
                                }
                            }
                        }}
                    />
                    <button 
                        type="button"
                        className="bg-[#14B8A6] text-white px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-wider active:scale-95 transition-transform shrink-0 shadow-lg shadow-[#14B8A6]/20"
                        onClick={() => {
                            const trimmed = newSkillText.trim();
                            const defaultSkills = ['Foratura', 'Catena', 'Regolazione Cambio', 'Freni', 'Centratura Ruota'];
                            if(trimmed && !defaultSkills.includes(trimmed) && !customSkills.includes(trimmed)) {
                                setCustomSkills([...customSkills, trimmed]);
                                setPeerSkills([...peerSkills, trimmed]);
                                setNewSkillText('');
                            }
                        }}
                    >
                        Aggiungi
                    </button>
                </div>`;

content = content.replace(target, rep);
fs.writeFileSync('src/components/Onboarding.tsx', content);
console.log('Replaced custom skills UI');
