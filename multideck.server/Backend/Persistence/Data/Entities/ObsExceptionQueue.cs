using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ObsExceptionQueue
{
    public Guid ObsexceptionId { get; set; }

    public string? ObsexceptionModuleCode { get; set; }

    public string? ObsexceptionSourceTable { get; set; }

    public Guid? ObsexceptionSourceId { get; set; }

    public string ObsexceptionSeverityCode { get; set; } = null!;

    public string ObsexceptionStatusCode { get; set; } = null!;

    public string ObsexceptionTitle { get; set; } = null!;

    public string? ObsexceptionMessage { get; set; }

    public Guid? ObsexceptionAssignedToUserId { get; set; }

    public DateTime? ObsexceptionDueAt { get; set; }

    public DateTime? ObsexceptionResolvedAt { get; set; }

    public string? ObsexceptionResolutionNotes { get; set; }

    public string ObsexceptionContextJson { get; set; } = null!;

    public DateTime ObsexceptionCreatedAt { get; set; }

    public virtual CmpUser? ObsexceptionAssignedToUser { get; set; }

    public virtual SysSubmoduleCode? ObsexceptionModuleCodeNavigation { get; set; }

    public virtual SysObseventSeverity ObsexceptionSeverityCodeNavigation { get; set; } = null!;

    public virtual SysObsqueueStatus ObsexceptionStatusCodeNavigation { get; set; } = null!;
}
