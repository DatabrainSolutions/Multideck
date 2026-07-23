using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SubAdminNotice
{
    public Guid SubnoticeId { get; set; }

    public string SubnoticeTitle { get; set; } = null!;

    public string SubnoticeBody { get; set; } = null!;

    public string? SubnoticeModuleCode { get; set; }

    public string SubnoticeSeverityCode { get; set; } = null!;

    public DateTime SubnoticeVisibleFrom { get; set; }

    public DateTime? SubnoticeVisibleTo { get; set; }

    public bool SubnoticeIsActive { get; set; }

    public DateTime SubnoticeCreatedAt { get; set; }

    public Guid? SubnoticeCreatedBy { get; set; }

    public virtual CmpUser? SubnoticeCreatedByNavigation { get; set; }

    public virtual SysSubmoduleCode? SubnoticeModuleCodeNavigation { get; set; }

    public virtual SysObseventSeverity SubnoticeSeverityCodeNavigation { get; set; } = null!;
}
