using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysJobStatus
{
    public string JsCode { get; set; } = null!;

    public string JsName { get; set; } = null!;

    public string? JsDescription { get; set; }

    public bool JsIsFinal { get; set; }

    public int JsSortOrder { get; set; }

    public bool JsIsActive { get; set; }

    public DateTime JsCreatedAt { get; set; }

    public virtual ICollection<JobHeader> JobHeaders { get; set; } = new List<JobHeader>();
}
