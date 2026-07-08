using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class LocDateTimeFieldRule
{
    public Guid LocdtruleId { get; set; }

    public string LocdtruleSourceTable { get; set; } = null!;

    public string LocdtruleSourceField { get; set; } = null!;

    public string? LocdtruleBusinessObjectCode { get; set; }

    public string LocdtruleStorageKindCode { get; set; } = null!;

    public string LocdtruleDefaultTimeZoneSourceCode { get; set; } = null!;

    public bool LocdtruleRequiresTimeZoneContext { get; set; }

    public bool LocdtruleDisplayUsingSourceTimeZone { get; set; }

    public bool LocdtruleAllowUserTimeZoneOverride { get; set; }

    public string? LocdtruleAmbiguityGroupCode { get; set; }

    public string? LocdtruleUihint { get; set; }

    public string? LocdtruleAiinstruction { get; set; }

    public bool LocdtruleIsActive { get; set; }

    public DateTime LocdtruleCreatedAt { get; set; }

    public DateTime LocdtruleUpdatedAt { get; set; }

    public virtual SysLoctimeZoneSourceType LocdtruleDefaultTimeZoneSourceCodeNavigation { get; set; } = null!;

    public virtual SysLocdateTimeStorageKind LocdtruleStorageKindCodeNavigation { get; set; } = null!;
}
