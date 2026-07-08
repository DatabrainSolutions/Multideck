using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobReference
{
    public Guid JobRefId { get; set; }

    public Guid JobRefJobId { get; set; }

    public string JobRefType { get; set; } = null!;

    public string JobRefValue { get; set; } = null!;

    public string? JobRefSource { get; set; }

    public bool JobRefIsPrimary { get; set; }

    public DateTime JobRefCreatedAt { get; set; }

    public Guid? JobRefCreatedBy { get; set; }

    public virtual JobHeader JobRefJob { get; set; } = null!;

    public virtual SysJobReferenceType JobRefTypeNavigation { get; set; } = null!;
}
