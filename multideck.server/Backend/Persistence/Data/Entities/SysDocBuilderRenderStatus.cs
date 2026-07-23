using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysDocBuilderRenderStatus
{
    public string DocbrsCode { get; set; } = null!;

    public string DocbrsName { get; set; } = null!;

    public bool DocbrsIsFinal { get; set; }

    public int DocbrsSortOrder { get; set; }

    public bool DocbrsIsActive { get; set; }

    public DateTime DocbrsCreatedAt { get; set; }

    public virtual ICollection<DocbRenderJob> DocbRenderJobs { get; set; } = new List<DocbRenderJob>();
}
