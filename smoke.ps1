$ErrorActionPreference = 'Stop'
$ws = Invoke-RestMethod http://127.0.0.1:8787/api/workflows
Write-Host ("WORKFLOWS: " + $ws.Count)
foreach ($w in $ws) { Write-Host (" - " + $w.id + " | " + $w.name + " | nodes=" + $w.nodes.Count) }
$wh = $null
foreach ($w in $ws) {
  $has = $w.nodes | Where-Object { $_.type -eq 'webhook' }
  if ($has) { $wh = $w; break }
}
if (-not $wh) { Write-Host 'NO_WEBHOOK_WF'; exit 1 }
$id = $wh.id
Write-Host ("DEMO_WF=" + $id)

$r1 = Invoke-RestMethod -Method Post -Uri ("http://127.0.0.1:8787/api/webhook/" + $id) -ContentType 'application/json' -Body '{"subject":"Счёт №123 за облако","amount":15000}'
Write-Host ("WEBHOOK_INVOICE: ok=" + $r1.ok + " output=" + ($r1.output | ConvertTo-Json -Compress))

$r2 = Invoke-RestMethod -Method Post -Uri ("http://127.0.0.1:8787/api/webhook/" + $id) -ContentType 'application/json' -Body '{"subject":"Привет","amount":100}'
Write-Host ("WEBHOOK_NOINVOICE: ok=" + $r2.ok + " output=" + ($r2.output | ConvertTo-Json -Compress))

$r3 = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8787/api/ai/generate' -ContentType 'application/json' -Body '{"prompt":"Каждые 5 минут проверять заказы и присылать в Telegram те что дороже 5000"}'
Write-Host ("AI_GENERATE: ai=" + $r3.ai + " name=" + $r3.workflow.name + " nodes=" + $r3.workflow.nodes.Count + " edges=" + $r3.workflow.edges.Count)

$r4 = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8787/api/ai/explain' -ContentType 'application/json' -Body ('{"workflowId":"' + $id + '"}')
Write-Host ("AI_EXPLAIN: [" + $r4.ai + "] " + $r4.text.Substring(0, [Math]::Min(120, $r4.text.Length)))

$hist = Invoke-RestMethod ("http://127.0.0.1:8787/api/workflows/" + $id + "/history")
Write-Host ("HISTORY: " + $hist.Count + " runs")

$html = (Invoke-WebRequest http://127.0.0.1:8787/ -UseBasicParsing).Content
Write-Host ("STATIC_PAGE: " + $html.Length + " bytes, has root=" + $html.Contains('id="root"'))
