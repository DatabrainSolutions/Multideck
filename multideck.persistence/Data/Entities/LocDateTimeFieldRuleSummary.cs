using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class LocDateTimeFieldRuleSummary
{
    public Guid? LocdtruleId { get; set; }

    public string? LocdtruleSourceTable { get; set; }

    public string? LocdtruleSourceField { get; set; }

    public string? LocdtruleBusinessObjectCode { get; set; }

    public string? LocdtruleStorageKindCode { get; set; }

    public string? LocdtstorageKindName { get; set; }

    public string? LocdtruleDefaultTimeZoneSourceCode { get; set; }

    public string? LoctzsourceName { get; set; }

    public bool? LocdtruleRequiresTimeZoneContext { get; set; }

    public bool? LocdtruleDisplayUsingSourceTimeZone { get; set; }

    public bool? LocdtruleAllowUserTimeZoneOverride { get; set; }

    public string? LocdtruleAmbiguityGroupCode { get; set; }

    public string? LocdtruleUihint { get; set; }

    public string? LocdtruleAiinstruction { get; set; }

    public bool? LocdtruleIsActive { get; set; }
}
