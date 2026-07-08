using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommTemplateStatus
{
    public string CommTemplateStatusCode { get; set; } = null!;

    public string CommTemplateStatusName { get; set; } = null!;

    public string? CommTemplateStatusDescription { get; set; }

    public bool CommTemplateStatusIsFinal { get; set; }

    public int CommTemplateStatusSortOrder { get; set; }

    public bool CommTemplateStatusIsActive { get; set; }

    public DateTime CommTemplateStatusCreatedAt { get; set; }

    public virtual ICollection<CommMessageTemplateVersion> CommMessageTemplateVersions { get; set; } = new List<CommMessageTemplateVersion>();

    public virtual ICollection<CommMessageTemplate> CommMessageTemplates { get; set; } = new List<CommMessageTemplate>();
}
