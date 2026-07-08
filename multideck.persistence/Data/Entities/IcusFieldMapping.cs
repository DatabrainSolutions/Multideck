using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class IcusFieldMapping
{
    public Guid IcusfmId { get; set; }

    public string IcusfmDeclarationKind { get; set; } = null!;

    public string? IcusfmICustomsSchemaVersion { get; set; }

    public string IcusfmSourcePath { get; set; } = null!;

    public string IcusfmTargetPath { get; set; } = null!;

    public string? IcusfmTransformRule { get; set; }

    public bool IcusfmIsRequired { get; set; }

    public bool IcusfmIsActive { get; set; }

    public DateTime IcusfmCreatedAt { get; set; }

    public virtual SysCustomsDeclarationKind IcusfmDeclarationKindNavigation { get; set; } = null!;
}
